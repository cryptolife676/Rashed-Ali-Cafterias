'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import {
  ShareholderInput,
  ShareholderUpdate,
  InvestmentInput,
  WithdrawalInput,
} from '@/lib/validators/shareholder';
import type { ActionResult } from './transactions';

const idSchema = z.string().uuid('Invalid ID');

export async function createShareholder(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = ShareholderInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shareholders')
    .insert(parsed.data)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: { id: data.id } };
}

export async function updateShareholder(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ShareholderUpdate.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('shareholders').update(rest).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function deactivateShareholder(id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'Invalid ID' };
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from('shareholders')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function recordInvestment(input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = InvestmentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase
    .from('investments')
    .insert({ ...parsed.data, recorded_by: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function recordWithdrawal(input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = WithdrawalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();

  // Reject overdrafts: invested + earned − already-withdrawn must cover this withdrawal.
  const { data: sum } = await supabase
    .from('v_shareholder_summary')
    .select('total_invested, total_profit_earned, total_withdrawn')
    .eq('shareholder_id', parsed.data.shareholder_id)
    .single();
  if (sum) {
    const available =
      Number(sum.total_invested) +
      Number(sum.total_profit_earned) -
      Number(sum.total_withdrawn);
    if (parsed.data.amount > available) {
      return {
        ok: false,
        error: `Insufficient balance — available ${available.toFixed(2)}, requested ${parsed.data.amount.toFixed(2)}.`,
      };
    }
  }

  const { error } = await supabase
    .from('withdrawals')
    .insert({ ...parsed.data, source: 'manual', approved_by: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function updateInvestment(
  id: string,
  patch: { amount?: number | string; invested_at?: string; notes?: string | null },
): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'Invalid ID' };
  await requireAdmin();
  const supabase = await createClient();
  const data: Record<string, unknown> = {};
  if (patch.amount !== undefined) {
    const n = Number(patch.amount);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'amount must be positive' };
    data.amount = n;
  }
  if (patch.invested_at !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.invested_at)) return { ok: false, error: 'invested_at must be YYYY-MM-DD' };
    data.invested_at = patch.invested_at;
  }
  if (patch.notes !== undefined) data.notes = patch.notes;
  const { error } = await supabase.from('investments').update(data).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function deleteInvestment(id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'Invalid ID' };
  await requireAdmin();
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from('investments')
    .select('shareholder_id, amount')
    .eq('id', id)
    .single();
  if (!inv) return { ok: false, error: 'Investment not found' };

  // Refuse if removing this investment would leave the shareholder
  // with a negative balance (i.e. they've already withdrawn against it).
  const { data: sum } = await supabase
    .from('v_shareholder_summary')
    .select('total_invested, total_profit_earned, total_withdrawn')
    .eq('shareholder_id', inv.shareholder_id)
    .single();
  if (sum) {
    const after =
      Number(sum.total_invested) -
      Number(inv.amount) +
      Number(sum.total_profit_earned) -
      Number(sum.total_withdrawn);
    if (after < 0) {
      return {
        ok: false,
        error: `Cannot delete: would leave shareholder balance at ${after.toFixed(2)}. Reverse withdrawals first.`,
      };
    }
  }

  const { error } = await supabase.from('investments').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function deleteWithdrawal(id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'Invalid ID' };
  await requireAdmin();
  const supabase = await createClient();
  // Refuse to delete if it was generated by a paid distribution
  const { data: w } = await supabase
    .from('withdrawals')
    .select('source, distribution_item_id')
    .eq('id', id)
    .single();
  if (w?.source === 'distribution') {
    return { ok: false, error: 'Cannot delete a distribution payout — void the run instead.' };
  }
  const { error } = await supabase.from('withdrawals').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}

export async function deleteShareholder(id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'Invalid ID' };
  await requireAdmin();
  const supabase = await createClient();
  // Block delete if there are paid distributions for this shareholder
  const { count } = await supabase
    .from('distribution_items')
    .select('id', { count: 'exact', head: true })
    .eq('shareholder_id', id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: 'Cannot delete: shareholder is referenced in distribution items. Deactivate instead.' };
  }
  const { error } = await supabase.from('shareholders').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/shareholders');
  return { ok: true, data: null };
}
