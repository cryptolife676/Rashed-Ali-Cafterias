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
import type { ActionResult } from './types';

const idSchema = z.string().uuid('Invalid ID');

type DeclaredProfit = {
  id: string;
  branch_id: string;
  period_month: string;
  net_profit: number;
  gross_income: number | null;
  total_expenses: number | null;
};

export async function createDistributionRun(input: unknown): Promise<ActionResult<{ run_id: string }>> {
  const user = await requireAdmin();
  const parsed = DistributionRunInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { branch_id, period_month, notes } = parsed.data;

  const supabase = await createClient();

  // 1) The month's declared profit. Not derived from a ledger any more —
  //    the branch reports one figure and this is it.
  const { data: profit, error: profitErr } = await supabase
    .from('monthly_profits')
    .select('id, branch_id, period_month, net_profit, gross_income, total_expenses')
    .eq('branch_id', branch_id)
    .eq('period_month', period_month)
    .maybeSingle<DeclaredProfit>();
  if (profitErr) return { ok: false, error: profitErr.message };
  if (!profit) {
    return {
      ok: false,
      error: 'No profit has been declared for this branch and month. Add it on the Monthly Profit page first.',
    };
  }

  const netProfit = round2(Number(profit.net_profit));

  // 2) Reject zero/loss months explicitly — don't let admins approve a run
  //    where every shareholder would silently receive 0.
  if (netProfit <= 0) {
    return {
      ok: false,
      error: `This month's declared profit is ${netProfit.toFixed(2)} — there is nothing to distribute. Correct the figure on the Monthly Profit page, or skip this month.`,
    };
  }

  // 3) Refuse a second live run for the same month (also enforced by
  //    uq_runs_active_monthly_profit, checked here for a readable message).
  const { count: liveRuns } = await supabase
    .from('distribution_runs')
    .select('*', { count: 'exact', head: true })
    .eq('monthly_profit_id', profit.id)
    .neq('status', 'void');
  if ((liveRuns ?? 0) > 0) {
    return {
      ok: false,
      error: 'This month already has a distribution run. Void it before creating another.',
    };
  }

  // 4) Active shareholders for the branch
  const { data: shs, error: shErr } = await supabase
    .from('shareholders')
    .select('id, ownership_pct, branch_id, is_active')
    .eq('is_active', true)
    .eq('branch_id', branch_id)
    .order('display_name');
  if (shErr) return { ok: false, error: shErr.message };

  const eligible = shs ?? [];
  if (eligible.length === 0) {
    return { ok: false, error: 'No active shareholders for this branch.' };
  }

  // 5) Largest-remainder allocation (sum of amounts == netProfit exactly)
  const weights = eligible.map((s) => Number(s.ownership_pct));
  const amounts = allocateLargestRemainder(netProfit, weights);

  // 6) Atomic: insert run + items inside a single Postgres transaction via RPC.
  //    The RPC re-reads the declared figure and aborts if it moved since we
  //    allocated, so a run's items always sum to its recorded net_profit.
  const itemsJson = eligible.map((s, i) => ({
    shareholder_id: s.id,
    ownership_pct_snapshot: Number(s.ownership_pct),
    computed_amount: amounts[i],
  }));

  const sb = createAdminClient();
  const { data: runId, error: runErr } = await sb.rpc('create_distribution_run', {
    p_monthly_profit_id: profit.id,
    p_expected_net_profit: netProfit,
    p_notes: notes ?? null,
    p_created_by: user.id,
    p_items: itemsJson,
  });
  if (runErr) return { ok: false, error: runErr.message };

  revalidatePath('/admin/distributions');
  revalidatePath('/admin/monthly-profit');
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
    .select('id, status, branch_id, monthly_profit_id, period_start, period_end, gross_income, total_expenses, net_profit')
    .eq('id', run_id)
    .single();
  if (rErr || !run) return { ok: false, error: rErr?.message ?? 'Run not found' };
  if (run.status !== 'draft') return { ok: false, error: `Run is ${run.status}, not draft.` };
  if (!run.monthly_profit_id) {
    return {
      ok: false,
      error: 'This run predates the monthly-profit model and can no longer be approved. Void it and create a new run.',
    };
  }

  // Re-read the declared figure and refuse if it drifted from the draft
  // snapshot. Prevents approving a run that no longer reflects what the
  // branch declared for the month.
  const { data: profit, error: profitErr } = await supabase
    .from('monthly_profits')
    .select('id, net_profit, gross_income, total_expenses')
    .eq('id', run.monthly_profit_id)
    .maybeSingle<Pick<DeclaredProfit, 'id' | 'net_profit' | 'gross_income' | 'total_expenses'>>();
  if (profitErr) return { ok: false, error: profitErr.message };
  if (!profit) {
    return { ok: false, error: 'The declared profit for this run no longer exists. Void the run.' };
  }

  const currentNet = round2(Number(profit.net_profit));
  if (
    currentNet !== Number(run.net_profit) ||
    Number(profit.gross_income ?? 0) !== Number(run.gross_income) ||
    Number(profit.total_expenses ?? 0) !== Number(run.total_expenses)
  ) {
    return {
      ok: false,
      error: `The declared profit changed since this draft was created (was net ${run.net_profit}, now ${currentNet}). Discard and recreate the draft.`,
    };
  }

  const { error: uErr } = await supabase
    .from('distribution_runs')
    .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', run_id);
  if (uErr) return { ok: false, error: uErr.message };

  // Lock the declared month so the basis of an approved payout is immutable.
  const { error: lockErr } = await supabase
    .from('monthly_profits')
    .update({ is_locked: true })
    .eq('id', run.monthly_profit_id);
  if (lockErr) return { ok: false, error: lockErr.message };

  revalidatePath('/admin/distributions');
  revalidatePath('/admin/monthly-profit');
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
    .select('status, monthly_profit_id')
    .eq('id', run_id)
    .single<{ status: string; monthly_profit_id: string | null }>();
  if (!run) return { ok: false, error: 'Not found' };
  if (run.status === 'paid') return { ok: false, error: 'Cannot void a paid run.' };

  const { error } = await supabase
    .from('distribution_runs')
    .update({ status: 'void' })
    .eq('id', run_id);
  if (error) return { ok: false, error: error.message };

  // Voiding releases the month: an approved run had locked it, and the
  // figure must become editable again so a corrected run can be made.
  if (run.monthly_profit_id) {
    const { error: unlockErr } = await supabase
      .from('monthly_profits')
      .update({ is_locked: false })
      .eq('id', run.monthly_profit_id);
    if (unlockErr) return { ok: false, error: unlockErr.message };
  }

  revalidatePath('/admin/distributions');
  revalidatePath('/admin/monthly-profit');
  return { ok: true, data: null };
}
