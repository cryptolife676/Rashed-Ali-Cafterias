'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import {
  DistributionRunInput,
  AdjustItemInput,
} from '@/lib/validators/distribution';
import { allocateLargestRemainder, round2 } from '@/lib/accounting/distribution';
import type { ActionResult } from './transactions';

/**
 * Create a DRAFT distribution run for a period.
 * - Computes income/expenses/net_profit from transactions in the period
 * - Snapshots current ownership_pct of active shareholders into distribution_items
 * - Uses largest-remainder allocation so per-shareholder amounts sum exactly to net_profit
 */
export async function createDistributionRun(input: unknown): Promise<ActionResult<{ run_id: string }>> {
  const user = await requireAdmin();
  const parsed = DistributionRunInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { branch_id, period_start, period_end, notes } = parsed.data;

  const supabase = await createClient();

  // 1) Period P&L via RPC
  const { data: pnl, error: pnlErr } = await supabase
    .rpc('compute_period_pnl', {
      p_branch: branch_id ?? null,
      p_start: period_start,
      p_end: period_end,
    })
    .single<{ income: number; expenses: number; net_profit: number }>();
  if (pnlErr) return { ok: false, error: pnlErr.message };

  const income = Number(pnl?.income ?? 0);
  const expenses = Number(pnl?.expenses ?? 0);
  const netProfit = round2(income - expenses);

  // 2) Active shareholders for the branch
  const { data: shs, error: shErr } = await supabase
    .from('shareholders')
    .select('id, ownership_pct, branch_id, is_active')
    .eq('is_active', true)
    .order('display_name');
  if (shErr) return { ok: false, error: shErr.message };

  const eligible = (shs ?? []).filter(
    (s) => branch_id == null || s.branch_id === branch_id,
  );
  if (eligible.length === 0) {
    return { ok: false, error: 'No active shareholders for this branch.' };
  }

  // 3) Allocate
  const weights = eligible.map((s) => Number(s.ownership_pct));
  const amounts = netProfit > 0
    ? allocateLargestRemainder(netProfit, weights)
    : eligible.map(() => 0); // losses are not pushed to shareholders by default

  // 4) Insert run + items
  const { data: run, error: runErr } = await supabase
    .from('distribution_runs')
    .insert({
      branch_id: branch_id ?? null,
      period_start,
      period_end,
      gross_income: income,
      total_expenses: expenses,
      net_profit: netProfit,
      status: 'draft',
      notes: notes ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (runErr) return { ok: false, error: runErr.message };

  const itemRows = eligible.map((s, i) => ({
    run_id: run.id,
    shareholder_id: s.id,
    ownership_pct_snapshot: Number(s.ownership_pct),
    computed_amount: amounts[i],
    manual_adjustment: 0,
  }));
  const { error: itemErr } = await supabase.from('distribution_items').insert(itemRows);
  if (itemErr) {
    // Rollback the run if items failed
    await supabase.from('distribution_runs').delete().eq('id', run.id);
    return { ok: false, error: itemErr.message };
  }

  revalidatePath('/admin/distributions');
  return { ok: true, data: { run_id: run.id } };
}

export async function adjustDistributionItem(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = AdjustItemInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();

  // Confirm parent run is still draft
  const { data: item } = await supabase
    .from('distribution_items')
    .select('id, run_id, distribution_runs:run_id(status)')
    .eq('id', parsed.data.item_id)
    .single<{ id: string; run_id: string; distribution_runs: { status: string } | null }>();
  if (!item) return { ok: false, error: 'Item not found' };
  if (item.distribution_runs?.status !== 'draft') {
    return { ok: false, error: 'Cannot adjust items on a non-draft run.' };
  }

  const { error } = await supabase
    .from('distribution_items')
    .update({ manual_adjustment: parsed.data.manual_adjustment })
    .eq('id', parsed.data.item_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/distributions');
  return { ok: true, data: null };
}

/**
 * Approve a draft run:
 *  - Marks run.status = 'approved'
 *  - Locks all transactions in the period (is_locked = true) so they can't be edited
 * (Keeping the engine simple: items are NOT auto-paid; admin pays explicitly.)
 */
export async function approveDistributionRun(run_id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: run, error: rErr } = await supabase
    .from('distribution_runs')
    .select('id, status, branch_id, period_start, period_end')
    .eq('id', run_id)
    .single();
  if (rErr || !run) return { ok: false, error: rErr?.message ?? 'Run not found' };
  if (run.status !== 'draft') return { ok: false, error: `Run is ${run.status}, not draft.` };

  const { error: uErr } = await supabase
    .from('distribution_runs')
    .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', run_id);
  if (uErr) return { ok: false, error: uErr.message };

  // Lock affected transactions
  let q = supabase
    .from('transactions')
    .update({ is_locked: true })
    .gte('entry_date', run.period_start)
    .lte('entry_date', run.period_end);
  if (run.branch_id) q = q.eq('branch_id', run.branch_id);
  const { error: lockErr } = await q;
  if (lockErr) return { ok: false, error: lockErr.message };

  revalidatePath('/admin/distributions');
  return { ok: true, data: null };
}

/**
 * Pay out an approved run:
 *  - Inserts a withdrawal row per item (source = 'distribution')
 *  - Sets item.paid_at and run.status = 'paid'
 * Uses service-role to ensure transactional consistency across the inserts.
 */
export async function payDistributionRun(run_id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const sb = createAdminClient();

  const { data: run, error: rErr } = await sb
    .from('distribution_runs')
    .select('id, status')
    .eq('id', run_id)
    .single();
  if (rErr || !run) return { ok: false, error: rErr?.message ?? 'Run not found' };
  if (run.status !== 'approved') return { ok: false, error: `Run must be approved (is ${run.status}).` };

  const { data: items, error: iErr } = await sb
    .from('distribution_items')
    .select('id, shareholder_id, final_amount, paid_at')
    .eq('run_id', run_id);
  if (iErr) return { ok: false, error: iErr.message };

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const wdRows = (items ?? [])
    .filter((it) => !it.paid_at && Number(it.final_amount) > 0)
    .map((it) => ({
      shareholder_id: it.shareholder_id,
      amount: Number(it.final_amount),
      withdrawn_at: today,
      source: 'distribution' as const,
      distribution_item_id: it.id,
      approved_by: user.id,
      notes: `Distribution payout (run ${run_id})`,
    }));

  if (wdRows.length > 0) {
    const { error: wErr } = await sb.from('withdrawals').insert(wdRows);
    if (wErr) return { ok: false, error: wErr.message };
  }

  const { error: iuErr } = await sb
    .from('distribution_items')
    .update({ paid_at: now })
    .eq('run_id', run_id)
    .is('paid_at', null);
  if (iuErr) return { ok: false, error: iuErr.message };

  const { error: rUpdErr } = await sb
    .from('distribution_runs')
    .update({ status: 'paid', paid_at: now })
    .eq('id', run_id);
  if (rUpdErr) return { ok: false, error: rUpdErr.message };

  revalidatePath('/admin/distributions');
  return { ok: true, data: null };
}

export async function voidDistributionRun(run_id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: run } = await supabase
    .from('distribution_runs')
    .select('status')
    .eq('id', run_id)
    .single();
  if (!run) return { ok: false, error: 'Not found' };
  if (run.status === 'paid') return { ok: false, error: 'Cannot void a paid run.' };
  const { error } = await supabase
    .from('distribution_runs')
    .update({ status: 'void' })
    .eq('id', run_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/distributions');
  return { ok: true, data: null };
}
