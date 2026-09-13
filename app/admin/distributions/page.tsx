import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/guards';
import { formatMoney, formatDate, formatMonth } from '@/lib/utils';
import DistributionForm from './DistributionForm';
import RunActions from './RunActions';
import RunItems from './RunItems';

export const dynamic = 'force-dynamic';

const RUN_SELECT =
  '*, branch:branches(name), items:distribution_items(id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment, final_amount, paid_at, shareholder:shareholders(display_name))';

export default async function DistributionsPage() {
  const user = await requireStaff();
  const isAdmin = ['super_admin', 'admin'].includes(user.role);
  const supabase = await createClient();

  // Split the two kinds of run. Backfilled history (25 months for Ummu Gaffa)
  // would otherwise fill the list and bury the runs that still need acting on.
  const [{ data: runs }, { data: historical }, { data: branches }] = await Promise.all([
    supabase
      .from('distribution_runs')
      .select(RUN_SELECT)
      .eq('is_backfill', false)
      .order('period_end', { ascending: false })
      .limit(20),
    supabase
      .from('distribution_runs')
      .select('id, period_start, net_profit, branch:branches(name), items:distribution_items(id, final_amount, shareholder:shareholders(display_name))')
      .eq('is_backfill', true)
      .order('period_start', { ascending: false })
      .limit(60),
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profit Distributions</h1>
      <DistributionForm branches={branches ?? []} />

      <div className="space-y-4">
        {(runs ?? []).map((r: any) => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-900">
                  {r.branch?.name ?? 'All branches'} · {formatMonth(r.period_start)}
                </div>
                <div className="text-sm text-slate-500">
                  status:{' '}
                  <span className={
                    r.status === 'paid' ? 'text-emerald-700' :
                    r.status === 'approved' ? 'text-blue-700' :
                    r.status === 'void' ? 'text-slate-400 line-through' : 'text-amber-700'
                  }>{r.status}</span>
                  {r.status === 'approved' && (
                    <>
                      {' · '}
                      <Link href="/admin/payouts" className="text-brand-700 hover:underline">
                        track handovers
                      </Link>
                    </>
                  )}
                </div>
                <div className="mt-1 text-sm">
                  <span>Amount for the group: <b className="text-brand-700">{formatMoney(r.net_profit)}</b></span>
                </div>
              </div>
              <RunActions runId={r.id} status={r.status} role={user.role} />
            </div>

            <RunItems
              declared={Number(r.net_profit)}
              editable={r.status === 'draft' && isAdmin}
              items={(r.items ?? []).map((it: any) => ({
                id: it.id,
                name: it.shareholder?.display_name ?? it.shareholder_id,
                pct: Number(it.ownership_pct_snapshot),
                computed: Number(it.computed_amount),
                adjustment: Number(it.manual_adjustment),
                final: Number(it.final_amount),
                paidAt: it.paid_at ?? null,
              }))}
            />
          </div>
        ))}
        {(runs ?? []).length === 0 && <div className="card text-center text-slate-400">No distribution runs yet.</div>}
      </div>

      {(historical ?? []).length > 0 && (
        <details className="card">
          <summary className="font-semibold cursor-pointer">
            Historical records ({(historical ?? []).length}) — imported, not computed here
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600 border-l-4 border-amber-400 pl-3">
              These months were paid out before this system existed and were imported
              from the owner&apos;s spreadsheet, with the figures exactly as recorded there.
              <b> The amount shown is the total for the members listed</b> — not the
              branch&apos;s profit for that month, which is not recorded.
            </p>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th><th>Branch</th><th>Members</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(historical ?? []).map((r: any) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{formatMonth(r.period_start)}</td>
                      <td className="text-slate-500">{r.branch?.name ?? '—'}</td>
                      <td className="text-slate-500 text-xs">
                        {(r.items ?? [])
                          .map((it: any) => `${it.shareholder?.display_name ?? '—'} ${formatMoney(it.final_amount)}`)
                          .join(' · ')}
                      </td>
                      <td className="text-right tabular-nums">{formatMoney(r.net_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
