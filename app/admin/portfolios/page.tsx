import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Admin "view-as-portfolio": pick any shareholder (grouped by branch) and see
 * exactly what that member sees on their own /portfolio page. If the member is
 * linked to a login (profile_id), we aggregate all their branch rows — same as
 * their real portfolio; otherwise we show the single selected row.
 */
export default async function PortfoliosPage({
  searchParams,
}: {
  searchParams: Promise<{ sh?: string }>;
}) {
  const { sh } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from('shareholders')
    .select('id, display_name, ownership_pct, profile_id, branch_id, branch:branches(name)')
    .eq('is_active', true)
    .order('display_name');

  const list: any[] = data ?? [];

  // Group members by branch for the selector
  const byBranch = new Map<string, any[]>();
  for (const s of list) {
    const bn = s.branch?.name ?? '—';
    const arr = byBranch.get(bn);
    if (arr) arr.push(s);
    else byBranch.set(bn, [s]);
  }
  const branchGroups = Array.from(byBranch.entries()).sort(([a], [b]) => a.localeCompare(b));

  const selected = list.find((s) => s.id === sh) ?? null;

  // Portfolio data for the selected member
  let view: any = null;
  if (selected) {
    const ids: string[] = selected.profile_id
      ? list.filter((s) => s.profile_id === selected.profile_id).map((s) => s.id)
      : [selected.id];

    const [{ data: summaries }, { data: investments }, { data: withdrawals }, { data: items }] =
      await Promise.all([
        supabase.from('v_shareholder_summary').select('*').in('shareholder_id', ids),
        supabase
          .from('investments')
          .select('id, amount, invested_at, notes, shareholder_id')
          .in('shareholder_id', ids)
          .order('invested_at', { ascending: false }),
        supabase
          .from('withdrawals')
          .select('id, amount, withdrawn_at, source, notes, shareholder_id')
          .in('shareholder_id', ids)
          .order('withdrawn_at', { ascending: false }),
        supabase
          .from('distribution_items')
          .select(
            'id, computed_amount, manual_adjustment, final_amount, paid_at, shareholder_id, run:distribution_runs(period_start, period_end, status, branch_id)',
          )
          .in('shareholder_id', ids)
          .order('created_at', { ascending: false }),
      ]);

    const rows = list.filter((s) => ids.includes(s.id));
    const invested = (summaries ?? []).reduce((a: number, s: any) => a + Number(s.total_invested ?? 0), 0);
    const earned = (summaries ?? []).reduce((a: number, s: any) => a + Number(s.total_profit_earned ?? 0), 0);
    const withdrawn = (summaries ?? []).reduce((a: number, s: any) => a + Number(s.total_withdrawn ?? 0), 0);
    const shBranch = new Map<string, string>(rows.map((s) => [s.id, s.branch?.name ?? '—']));

    view = {
      rows,
      summaries: summaries ?? [],
      investments: investments ?? [],
      withdrawals: withdrawals ?? [],
      items: items ?? [],
      totals: { invested, earned, withdrawn, balance: invested + earned - withdrawn },
      shBranch,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Shareholder Portfolios</h1>
        <p className="page-subtitle">Select a member to view their portfolio exactly as they see it.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* ── Selector ── */}
        <aside className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Members by branch
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {branchGroups.map(([branchName, rows]) => (
              <div key={branchName}>
                <div className="px-4 py-2 bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-100">
                  {branchName}
                </div>
                {rows.map((s) => (
                  <Link
                    key={s.id}
                    href={`/admin/portfolios?sh=${s.id}`}
                    className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm border-b border-slate-50 transition-colors ${
                      s.id === sh ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{s.display_name}</span>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">
                      {Number(s.ownership_pct).toFixed(2)}%
                    </span>
                  </Link>
                ))}
              </div>
            ))}
            {list.length === 0 && <div className="px-4 py-6 text-sm text-slate-400">No shareholders.</div>}
          </div>
        </aside>

        {/* ── Portfolio view ── */}
        <div className="space-y-6">
          {!view ? (
            <div className="card text-center text-slate-400 py-20">
              Select a member on the left to view their portfolio.
            </div>
          ) : (
            <>
              <div className="card">
                <div className="text-xs text-slate-500">Portfolio · admin view</div>
                <div className="text-xl font-bold text-slate-900">{selected.display_name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {view.rows.map((s: any) => (
                    <span key={s.id} className="mr-3">
                      {s.branch?.name ?? '—'}: {Number(s.ownership_pct).toFixed(2)}%
                    </span>
                  ))}
                  {!selected.profile_id && <span className="badge-slate ml-1">not linked to a login</span>}
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="kpi"><span className="kpi-label">Total Invested</span><span className="kpi-value">{formatMoney(view.totals.invested)}</span></div>
                <div className="kpi"><span className="kpi-label">Profit Earned</span><span className="kpi-value">{formatMoney(view.totals.earned)}</span></div>
                <div className="kpi"><span className="kpi-label">Withdrawn</span><span className="kpi-value">{formatMoney(view.totals.withdrawn)}</span></div>
                <div className="kpi"><span className="kpi-label">Balance</span><span className="kpi-value">{formatMoney(view.totals.balance)}</span></div>
              </div>

              {/* Ownership by branch */}
              <div className="card">
                <h2 className="font-semibold mb-3">Ownership by branch</h2>
                <table className="tbl">
                  <thead><tr><th>Branch</th><th className="text-right">Ownership %</th><th className="text-right">Invested</th><th className="text-right">Profit</th><th className="text-right">Withdrawn</th></tr></thead>
                  <tbody>
                    {view.rows.map((s: any) => {
                      const sm = view.summaries.find((x: any) => x.shareholder_id === s.id);
                      return (
                        <tr key={s.id}>
                          <td>{s.branch?.name ?? '—'}</td>
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
                    {view.items.map((it: any) => (
                      <tr key={it.id}>
                        <td className="text-slate-500">{view.shBranch.get(it.shareholder_id) ?? '—'}</td>
                        <td>{it.run?.period_start ? `${formatDate(it.run.period_start)} → ${formatDate(it.run.period_end)}` : '—'}</td>
                        <td>{it.run?.status}</td>
                        <td className="text-right tabular-nums">{formatMoney(it.computed_amount)}</td>
                        <td className="text-right tabular-nums">{formatMoney(it.manual_adjustment)}</td>
                        <td className="text-right tabular-nums font-medium">{formatMoney(it.final_amount)}</td>
                        <td>{it.paid_at ? formatDate(it.paid_at) : '—'}</td>
                      </tr>
                    ))}
                    {view.items.length === 0 && (
                      <tr><td colSpan={7} className="text-slate-400 py-4 text-center">No distributions yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Investments + Withdrawals */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="card">
                  <h2 className="font-semibold mb-3">Investments</h2>
                  <table className="tbl">
                    <thead><tr><th>Date</th><th>Branch</th><th className="text-right">Amount</th><th>Notes</th></tr></thead>
                    <tbody>
                      {view.investments.map((i: any) => (
                        <tr key={i.id}>
                          <td>{formatDate(i.invested_at)}</td>
                          <td className="text-slate-500">{view.shBranch.get(i.shareholder_id) ?? '—'}</td>
                          <td className="text-right tabular-nums">{formatMoney(i.amount)}</td>
                          <td className="text-slate-500 truncate max-w-xs">{i.notes ?? ''}</td>
                        </tr>
                      ))}
                      {view.investments.length === 0 && (
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
                      {view.withdrawals.map((w: any) => (
                        <tr key={w.id}>
                          <td>{formatDate(w.withdrawn_at)}</td>
                          <td className="text-slate-500">{view.shBranch.get(w.shareholder_id) ?? '—'}</td>
                          <td className="text-slate-500">{w.source}</td>
                          <td className="text-right tabular-nums">{formatMoney(w.amount)}</td>
                        </tr>
                      ))}
                      {view.withdrawals.length === 0 && (
                        <tr><td colSpan={4} className="text-slate-400 py-4 text-center">None</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
