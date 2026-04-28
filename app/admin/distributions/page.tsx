import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatDate } from '@/lib/utils';
import DistributionForm from './DistributionForm';
import RunActions from './RunActions';

export const dynamic = 'force-dynamic';

export default async function DistributionsPage() {
  const supabase = await createClient();
  const [{ data: runs }, { data: branches }] = await Promise.all([
    supabase
      .from('distribution_runs')
      .select('*, items:distribution_items(id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment, final_amount, paid_at, shareholder:shareholders(display_name))')
      .order('period_end', { ascending: false })
      .limit(20),
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
                <div className="text-sm text-slate-500">
                  {formatDate(r.period_start)} → {formatDate(r.period_end)} · status:{' '}
                  <span className={
                    r.status === 'paid' ? 'text-emerald-700' :
                    r.status === 'approved' ? 'text-blue-700' :
                    r.status === 'void' ? 'text-slate-400 line-through' : 'text-amber-700'
                  }>{r.status}</span>
                </div>
                <div className="mt-1 flex gap-6 text-sm">
                  <span>Income: <b>{formatMoney(r.gross_income)}</b></span>
                  <span>Expenses: <b>{formatMoney(r.total_expenses)}</b></span>
                  <span>Net: <b className="text-brand-700">{formatMoney(r.net_profit)}</b></span>
                </div>
              </div>
              <RunActions runId={r.id} status={r.status} />
            </div>

            <table className="tbl mt-4">
              <thead><tr><th>Shareholder</th><th className="text-right">%</th><th className="text-right">Computed</th><th className="text-right">Adjustment</th><th className="text-right">Final</th><th>Paid</th></tr></thead>
              <tbody>
                {(r.items ?? []).map((it: any) => (
                  <tr key={it.id}>
                    <td>{it.shareholder?.display_name ?? it.shareholder_id}</td>
                    <td className="text-right">{Number(it.ownership_pct_snapshot).toFixed(2)}%</td>
                    <td className="text-right tabular-nums">{formatMoney(it.computed_amount)}</td>
                    <td className="text-right tabular-nums">{formatMoney(it.manual_adjustment)}</td>
                    <td className="text-right tabular-nums font-medium">{formatMoney(it.final_amount)}</td>
                    <td>{it.paid_at ? formatDate(it.paid_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {(runs ?? []).length === 0 && <div className="card text-center text-slate-400">No distribution runs yet.</div>}
      </div>
    </div>
  );
}
