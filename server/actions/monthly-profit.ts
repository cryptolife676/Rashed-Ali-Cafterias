'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/guards';
import {
  MonthlyProfitInput,
  MonthlyProfitUpdate,
} from '@/lib/validators/monthly-profit';
import type { ActionResult } from './types';
import { getTeamByBranch } from '@/lib/team';

const idSchema = z.string().uuid('Invalid ID');

function revalidate() {
  revalidatePath('/admin/monthly-profit');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/distributions');
}

/**
 * Declare (or re-declare) the payout group's share for one branch-month.
 *
 * The figure is what the group is collectively owed — not the branch's
 * profit. Upserts on (branch_id, period_month): a correction to a figure
 * already reported should overwrite it, not create a second row that would
 * make the month ambiguous. Refused once the month is locked.
 */
export async function upsertMonthlyProfit(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireStaff();
  const parsed = MonthlyProfitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { branch_id, period_month } = parsed.data;

  // Refuse a branch with nobody to divide the figure between. Without this
  // the row saves happily and only fails later at distribution time, leaving
  // an amount recorded against a branch it can never be paid out for.
  // Through the security-definer lookup: an accountant can read only his own
  // shareholder rows, so counting shareholders directly always found nobody
  // and refused every save he made.
  let members = 0;
  try {
    members = (await getTeamByBranch(supabase, [branch_id])).length;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not load team members' };
  }
  if (members === 0) {
    return {
      ok: false,
      error:
        'No tracked members in this branch yet, so there is nobody to divide the amount between. Add them on the Shareholders page first.',
    };
  }

  // Check the lock before writing so the user gets a readable message
  // instead of the raw trigger exception.
  const { data: existing } = await supabase
    .from('monthly_profits')
    .select('id, is_locked')
    .eq('branch_id', branch_id)
    .eq('period_month', period_month)
    .maybeSingle<{ id: string; is_locked: boolean }>();

  if (existing?.is_locked) {
    return {
      ok: false,
      error:
        'This month has already been distributed and can no longer be edited. Void the distribution run first.',
    };
  }

  const { data, error } = await supabase
    .from('monthly_profits')
    .upsert(
      { ...parsed.data, recorded_by: user.id },
      { onConflict: 'branch_id,period_month' },
    )
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function updateMonthlyProfit(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = MonthlyProfitUpdate.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...rest } = parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('monthly_profits')
    .select('is_locked')
    .eq('id', id)
    .maybeSingle<{ is_locked: boolean }>();
  if (!existing) return { ok: false, error: 'Monthly profit not found' };
  if (existing.is_locked) {
    return {
      ok: false,
      error: 'This month has been distributed and is locked.',
    };
  }

  const { error } = await supabase.from('monthly_profits').update(rest).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, data: null };
}

export async function deleteMonthlyProfit(id: string): Promise<ActionResult> {
  await requireStaff();
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, error: 'Invalid ID' };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('monthly_profits')
    .select('is_locked')
    .eq('id', id)
    .maybeSingle<{ is_locked: boolean }>();
  if (!existing) return { ok: false, error: 'Monthly profit not found' };
  if (existing.is_locked) {
    return { ok: false, error: 'Cannot delete a month that has been distributed.' };
  }

  // A draft run doesn't lock the row, but monthly_profit_id is ON DELETE
  // RESTRICT — catch it here rather than surfacing a raw FK violation.
  const { count } = await supabase
    .from('distribution_runs')
    .select('*', { count: 'exact', head: true })
    .eq('monthly_profit_id', id)
    .neq('status', 'void');
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: 'A distribution run is using this month. Void that run first.',
    };
  }

  const { error } = await supabase.from('monthly_profits').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, data: null };
}
