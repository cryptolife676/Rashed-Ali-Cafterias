'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import type { ActionResult } from './types';

const idSchema = z.string().uuid('Invalid ID');
const idsSchema = z
  .array(z.string().uuid('Invalid ID'))
  .min(1, 'Select at least one payout')
  .max(500, 'Too many payouts in one action');

function revalidate() {
  revalidatePath('/admin/payouts');
  revalidatePath('/admin/distributions');
  revalidatePath('/admin/portfolios');
  revalidatePath('/portfolio');
}

/**
 * Mark specific payouts as handed over.
 *
 * Admin-only: marking a handover asserts that money changed hands, so it
 * carries the same weight as paying a run. `paid_by` records who said so.
 *
 * The RPC promotes the parent run to 'paid' only once nothing is left
 * outstanding on it, so a partial handover keeps the rest payable.
 */
export async function payDistributionItems(
  itemIds: string[],
): Promise<ActionResult<{ paid_count: number; total_amount: number }>> {
  const user = await requireAdmin();
  const parsed = idsSchema.safeParse(itemIds);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const sb = createAdminClient();
  const { data, error } = await sb
    .rpc('pay_distribution_items', { p_item_ids: parsed.data, p_actor: user.id })
    .single<{ paid_count: number; total_amount: number }>();
  if (error) return { ok: false, error: error.message };

  revalidate();
  return {
    ok: true,
    data: {
      paid_count: Number(data?.paid_count ?? 0),
      total_amount: Number(data?.total_amount ?? 0),
    },
  };
}

/**
 * Reverse a handover marked in error. Deletes the withdrawal so
 * total_withdrawn stays truthful, and drops the run back to 'approved'.
 */
export async function unpayDistributionItem(itemId: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = idSchema.safeParse(itemId);
  if (!parsed.success) return { ok: false, error: 'Invalid ID' };

  const sb = createAdminClient();
  const { error } = await sb.rpc('unpay_distribution_item', {
    p_item_id: parsed.data,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true, data: null };
}
