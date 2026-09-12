import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatMonth } from '@/lib/utils';
import MonthlyProfitForm from './MonthlyProfitForm';
import ProfitRowActions from './ProfitRowActions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  period_month: string;
  net_profit: number;
  gross_income: number | null;
  total_expenses: number | null;
  notes: string | null;
  is_locked: boolean;
  branch: { name: string } | null;
  runs: { id: string; status: string }[] | null;
};

export default async function MonthlyProfitPage() {
  const supabase = await createClient();
  const [{ data: profits }, { data: branches }] = await Promise.all([
    supabase
      .from('monthly_profits')
      .select(
        'id, period_month, net_profit, gross_income, total_expenses, notes, is_locked, branch:branches(name), runs:distribution_runs(id, status)',
      )
      .order('period_month', { ascending: false })
      .limit(100),
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
  ]);

  const rows = (profits ?? []) as unknown as Row[];

  // The admin's real to-do list: a declared month with no live run behind it.
  const pending = rows.filter(
    (r) => !(r.runs ?? []).some((run) => run.status !== 'void') && Number(r.net_profit) > 0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Monthly Profit</h1>
        <p className="text-sm text-slate-500 mt-1">
          One declared figure per branch per month — the basis for every shareholder
          distribution. Day-to-day sales and costs stay in each branch&apos;s own books.
        </p>
      </div>

      <MonthlyProfitForm branches={branches ?? []} />

      {pending.length > 0 && (
        <div className="card border-l-4 border-amber-400">
          <h2 className="font-semibold text-sm">Awaiting distribution</h2>
          <p className="text-sm text-slate-600 mt-1">
            {pending.length === 1 ? 'One month has' : `${pending.length} months have`} a
            declared profit with no distribution run yet:{' '}
            {pending
              .slice(0, 6)
              .map((r) => `${r.branch?.name ?? '—'} · ${formatMonth(r.period_month)}`)
              .join(', ')}
            {pending.length > 6 && ` and ${pending.length - 6} more`}.{' '}
            <Link href="/admin/distributions" className="text-brand-700 hover:underline">
              Go to Distributions
            </Link>
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold mb-3">Declared months (last 100)</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th>Branch</th>
              <th className="text-right">Net Profit</th>
              <th className="text-right">Income</th>
              <th className="text-right">Expenses</th>
              <th>Notes</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const liveRun = (r.runs ?? []).find((run) => run.status !== 'void');
              const net = Number(r.net_profit);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatMonth(r.period_month)}</td>
                  <td>{r.branch?.name ?? '—'}</td>
                  <td
                    className={`text-right tabular-nums font-medium ${
                      net >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {formatMoney(net)}
                  </td>
                  <td className="text-right tabular-nums text-slate-500">
                    {r.gross_income == null ? '—' : formatMoney(r.gross_income)}
                  </td>
                  <td className="text-right tabular-nums text-slate-500">
                    {r.total_expenses == null ? '—' : formatMoney(r.total_expenses)}
                  </td>
                  <td className="text-slate-500 truncate max-w-xs">{r.notes ?? ''}</td>
                  <td className="whitespace-nowrap">
                    {liveRun ? (
                      <Link
                        href="/admin/distributions"
                        className="text-xs hover:underline"
                        title={`Distribution run ${liveRun.status}`}
                      >
                        <span
                          className={
                            liveRun.status === 'paid'
                              ? 'text-emerald-700'
                              : liveRun.status === 'approved'
                                ? 'text-blue-700'
                                : 'text-amber-700'
                          }
                        >
                          {liveRun.status === 'paid'
                            ? 'distributed'
                            : liveRun.status === 'approved'
                              ? 'approved'
                              : 'draft run'}
                        </span>
                      </Link>
                    ) : net > 0 ? (
                      <span className="text-xs text-slate-400">not distributed</span>
                    ) : (
                      <span className="text-xs text-slate-400">nothing to distribute</span>
                    )}
                    {r.is_locked && <span className="text-xs text-amber-600 ml-2">locked</span>}
                  </td>
                  <td>
                    <ProfitRowActions
                      profitId={r.id}
                      label={`${r.branch?.name ?? '—'} · ${formatMonth(r.period_month)}`}
                      locked={r.is_locked || Boolean(liveRun)}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-slate-400 py-6 text-center">
                  No months declared yet — add the first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
