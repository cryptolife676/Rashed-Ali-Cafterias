import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import PayoutTable, { type PayoutRow } from './PayoutTable';

export const dynamic = 'force-dynamic';

type ItemRow = {
  id: string;
  shareholder_id: string;
  final_amount: number;
  paid_at: string | null;
  payment_ref: string | null;
  run: {
    id: string;
    status: string;
    period_start: string;
    is_backfill: boolean;
    branch: { name: string } | null;
  } | null;
  shareholder: {
    display_name: string;
    payout_via_profile_id: string | null;
  } | null;
};

export default async function PayoutsPage() {
  const user = await requireAdmin();
  const supabase = await createClient();

  // Only runs that have been approved carry real obligations — a draft can
  // still be voided or recomputed. Backfilled runs are historical records of
  // money already handed over, so they are excluded rather than listed as
  // something to pay.
  const { data: items } = await supabase
    .from('distribution_items')
    .select(
      'id, shareholder_id, final_amount, paid_at, payment_ref, ' +
        'run:distribution_runs!inner(id, status, period_start, is_backfill, branch:branches(name)), ' +
        'shareholder:shareholders(display_name, payout_via_profile_id)',
    )
    .in('run.status', ['approved', 'paid'])
    .eq('run.is_backfill', false)
    .gt('final_amount', 0)
    .order('paid_at', { nullsFirst: true })
    .limit(1000);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name');
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  const rows: PayoutRow[] = ((items ?? []) as unknown as ItemRow[]).map((it) => {
    const via = it.shareholder?.payout_via_profile_id ?? null;
    return {
      itemId: it.id,
      shareholderId: it.shareholder_id,
      member: it.shareholder?.display_name ?? '—',
      branch: it.run?.branch?.name ?? '—',
      month: it.run?.period_start ?? '',
      amount: Number(it.final_amount),
      paid: Boolean(it.paid_at),
      paidAt: it.paid_at,
      remarks: it.payment_ref,
      viaProfileId: via,
      viaName: via ? (nameById.get(via) ?? 'unknown') : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every payout from an approved distribution run. Tick the ones you have
          handed over, with the date you paid and any remark, to keep track of
          what is still owed.
        </p>
      </div>

      <PayoutTable
        rows={rows}
        currentUserId={user.id}
        currentUserName={user.fullName}
      />
    </div>
  );
}
