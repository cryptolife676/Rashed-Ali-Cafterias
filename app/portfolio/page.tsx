import { requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // A person can be a shareholder in multiple branches — fetch all rows
  const { data: shareholderRows } = await supabase
    .from('shareholders')
    .select('id, display_name, ownership_pct, branch_id, joined_at, branch:branches(name)')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .order('display_name');

  if (!shareholderRows || shareholderRows.length === 0) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="card max-w-md text-center">
          <div className="text-lg font-semibold">No shareholder profile</div>
          <p className="text-sm text-slate-500 mt-2">
            Your account isn&apos;t linked to a shareholder record yet. Please contact the admin.
          </p>
          <form action="/api/auth/signout" method="post" className="mt-4">
            <button className="btn-secondary text-xs">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  const shareholderIds = shareholderRows.map((s) => s.id);
  const displayName = shareholderRows[0].display_name;

  // Fetch all data across every branch this person is in
  const [{ data: summaries }, { data: investments }, { data: withdrawals }, { data: items }] =
    await Promise.all([
      supabase
        .from('v_shareholder_summary')
        .select('*')
        .in('shareholder_id', shareholderIds),
      supabase
        .from('investments')
        .select('id, amount, invested_at, notes, shareholder_id, branch_id, branch:branches(name)')
        .in('shareholder_id', shareholderIds)
        .order('invested_at', { ascending: false }),
      supabase
        .from('withdrawals')
        .select('id, amount, withdrawn_at, source, notes, shareholder_id')
        .in('shareholder_id', shareholderIds)
        .order('withdrawn_at', { ascending: false }),
      supabase
        .from('distribution_items')
        .select(
          'id, computed_amount, manual_adjustment, final_amount, paid_at, shareholder_id, run:distribution_runs(period_start, period_end, status, branch_id)',
        )
        .in('shareholder_id', shareholderIds)
        .order('created_at', { ascending: false }),
    ]);

  // Aggregate totals across all branches
  const totalInvested = (summaries ?? []).reduce((a, s: any) => a + Number(s.total_invested ?? 0), 0);
  const totalEarned   = (summaries ?? []).reduce((a, s: any) => a + Number(s.total_profit_earned ?? 0), 0);
  const totalWithdrawn = (summaries ?? []).reduce((a, s: any) => a + Number(s.total_withdrawn ?? 0), 0);
  const balance = totalInvested + totalEarned - totalWithdrawn;

  // Map shareholder id → branch name for display
  const shBranch = new Map(
    shareholderRows.map((s) => [s.id, (s.branch as unknown as { name: string } | null)?.name ?? '—']),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">Portfolio</div>
          <div className="font-semibold">{displayName}</div>
          <div className="text-xs text-slate-400">
            {shareholderRows.map((s) => (
              <span key={s.id} className="mr-3">
                {(s.branch as unknown as { name: string } | null)?.name ?? '—'}: {Number(s.ownership_pct).toFixed(2)}%
              </span>
            ))}
          </div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="btn-secondary text-xs">Sign out</button>
        </form>
      </header>

      <main className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Summary KPIs across all branches */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi"><span className="kpi-label">Total Invested</span><span className="kpi-value">{formatMoney(totalInvested)}</span></div>
          <div className="kpi"><span className="kpi-label">Profit Earned</span><span className="kpi-value">{formatMoney(totalEarned)}</span></div>
          <div className="kpi"><span className="kpi-label">Withdrawn</span><span className="kpi-value">{formatMoney(totalWithdrawn)}</span></div>
          <div className="kpi"><span className="kpi-label">Balance</span><span className="kpi-value">{formatMoney(balance)}</span></div>
        </div>

        {/* Per-branch ownership breakdown */}
        <div className="card">
          <h2 className="font-semibold mb-3">Ownership by branch</h2>
          <table className="tbl">
            <thead><tr><th>Branch</th><th className="text-right">Ownership %</th><th className="text-right">Invested</th><th className="text-right">Profit</th><th className="text-right">Withdrawn</th></tr></thead>
            <tbody>
              {shareholderRows.map((s) => {
                const sm = (summaries ?? []).find((x: any) => x.shareholder_id === s.id) as any;
                return (
                  <tr key={s.id}>
                    <td>{(s.branch as unknown as { name: string } | null)?.name ?? '—'}</td>
                    <td className="text-right tabular-nums">{Number(s.ownership_pct).toFixed(2)}%</td>
                    <td className="text-right tabular-nums">{formatMoney(sm?.total_invested ?? 0)}</td>
                    <td className="text-right tabular-nums">{formatMoney(sm?.total_profit_earned ?? 0)}</td>
                    <td className="text-right tabular-nums">{formatMoney(sm?.total_withdrawn ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Distributions */}
        <div className="card">
          <h2 className="font-semibold mb-3">Distributions</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Branch</th><th>Period</th><th>Status</th>
                <th className="text-right">Computed</th><th className="text-right">Adjustment</th>
                <th className="text-right">Final</th><th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it: any) => (
                <tr key={it.id}>
                  <td className="text-slate-500">{shBranch.get(it.shareholder_id) ?? '—'}</td>
                  <td>{it.run?.period_start ? `${formatDate(it.run.period_start)} → ${formatDate(it.run.period_end)}` : '—'}</td>
                  <td>{it.run?.status}</td>
                  <td className="text-right tabular-nums">{formatMoney(it.computed_amount)}</td>
                  <td className="text-right tabular-nums">{formatMoney(it.manual_adjustment)}</td>
                  <td className="text-right tabular-nums font-medium">{formatMoney(it.final_amount)}</td>
                  <td>{it.paid_at ? formatDate(it.paid_at) : '—'}</td>
                </tr>
              ))}
              {(items ?? []).length === 0 && (
                <tr><td colSpan={7} className="text-slate-400 py-4 text-center">No distributions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-semibold mb-3">Investments</h2>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Branch</th><th className="text-right">Amount</th><th>Notes</th></tr></thead>
              <tbody>
                {(investments ?? []).map((i: any) => {
                  const branchLabel =
                    (i.branch as unknown as { name: string } | null)?.name ??
                    shBranch.get(i.shareholder_id) ?? '—';
                  return (
                    <tr key={i.id}>
                      <td>{formatDate(i.invested_at)}</td>
                      <td className="text-slate-500">{branchLabel}</td>
                      <td className="text-right tabular-nums">{formatMoney(i.amount)}</td>
                      <td className="text-slate-500 truncate max-w-xs">{i.notes ?? ''}</td>
                    </tr>
                  );
                })}
                {(investments ?? []).length === 0 && (
                  <tr><td colSpan={4} className="text-slate-400 py-4 text-center">None</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-3">Withdrawals</h2>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Branch</th><th>Source</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {(withdrawals ?? []).map((w: any) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.withdrawn_at)}</td>
                    <td className="text-slate-500">{shBranch.get(w.shareholder_id) ?? '—'}</td>
                    <td className="text-slate-500">{w.source}</td>
                    <td className="text-right tabular-nums">{formatMoney(w.amount)}</td>
                  </tr>
                ))}
                {(withdrawals ?? []).length === 0 && (
                  <tr><td colSpan={4} className="text-slate-400 py-4 text-center">None</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
