'use server';

import { z } from 'zod';
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

const idSchema = z.string().uuid('Invalid ID');

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

  // 2) Reject zero/loss periods explicitly — don't let admins approve a run
  //    where every shareholder would silently receive 0.
  if (netProfit <= 0) {
    return {
      ok: false,
      error: `Period has no distributable profit (income ${income.toFixed(2)} − expenses ${expenses.toFixed(2)} = ${netProfit.toFixed(2)}). Adjust transactions or skip this run.`,
    };
  }

  // 3) Active shareholders for the branch
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

  // 4) Largest-remainder allocation (sum of amounts == netProfit exactly)
  const weights = eligible.map((s) => Number(s.ownership_pct));
  const amounts = allocateLargestRemainder(netProfit, weights);

  // 5) Atomic: insert run + items inside a single Postgres transaction via RPC.
  //    A non-atomic two-step insert risks leaving orphaned run rows on partial failure.
  const itemsJson = eligible.map((s, i) => ({
    shareholder_id: s.id,
    ownership_pct_snapshot: Number(s.ownership_pct),
    computed_amount: amounts[i],
  }));

  const sb = createAdminClient();
  const { data: runId, error: runErr } = await sb.rpc('create_distribution_run', {
    p_branch_id: branch_id ?? null,
    p_period_start: period_start,
    p_period_end: period_end,
    p_gross_income: income,
    p_total_expenses: expenses,
    p_net_profit: netProfit,
    p_notes: notes ?? null,
    p_created_by: user.id,
    p_items: itemsJson,
  });
  if (runErr) return { ok: false, error: runErr.message };

  revalidatePath('/admin/distributions');
  return { ok: true, data: { run_id: runId as string } };
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

export async function approveDistributionRun(run_id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(run_id);
  if (!idCheck.success) return { ok: false, error: 'Invalid run ID' };

  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: run, error: rErr } = await supabase
    .from('distribution_runs')
    .select('id, status, branch_id, period_start, period_end, gross_income, total_expenses, net_profit')
    .eq('id', run_id)
    .single();
  if (rErr || !run) return { ok: false, error: rErr?.message ?? 'Run not found' };
  if (run.status !== 'draft') return { ok: false, error: `Run is ${run.status}, not draft.` };

  // Recompute period totals and refuse if they drifted from the draft snapshot.
  // Prevents approving a run that no longer reflects the actual ledger.
  const { data: pnl, error: pnlErr } = await supabase
    .rpc('compute_period_pnl', {
      p_branch: run.branch_id ?? null,
      p_start: run.period_start,
      p_end: run.period_end,
    })
    .single<{ income: number; expenses: number; net_profit: number }>();
  if (pnlErr) return { ok: false, error: pnlErr.message };

  const currentNet = round2(Number(pnl?.income ?? 0) - Number(pnl?.expenses ?? 0));
  if (
    Number(pnl?.income ?? 0) !== Number(run.gross_income) ||
    Number(pnl?.expenses ?? 0) !== Number(run.total_expenses) ||
    currentNet !== Number(run.net_profit)
  ) {
    return {
      ok: false,
      error: `Period totals changed since this draft was created (was net ${run.net_profit}, now ${currentNet}). Discard and recreate the draft.`,
    };
  }

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

export async function payDistributionRun(run_id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(run_id);
  if (!idCheck.success) return { ok: false, error: 'Invalid run ID' };

  const user = await requireAdmin();
  const sb = createAdminClient();

  // All work done atomically inside a single Postgres function.
  // The partial unique index on withdrawals(distribution_item_id) where
  // source='distribution' makes the insert idempotent under concurrent calls.
  const { error } = await sb.rpc('pay_distribution_run', {
    p_run_id: run_id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/distributions');
  return { ok: true, data: null };
}

export async function voidDistributionRun(run_id: string): Promise<ActionResult> {
  const idCheck = idSchema.safeParse(run_id);
  if (!idCheck.success) return { ok: false, error: 'Invalid run ID' };

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
