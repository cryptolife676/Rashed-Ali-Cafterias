import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [
    { data: pnl },
    { data: rawMonthly },
    { count: shCount },
  ] = await Promise.all([
    supabase
      .rpc('compute_period_pnl', { p_branch: null, p_start: start, p_end: end })
      .single<{ income: number; expenses: number; net_profit: number }>(),
    supabase
      .from('v_monthly_pnl')
      .select('month, income, expenses, net_profit')
      .order('month', { ascending: false })
      .limit(60),
    supabase
      .from('shareholders')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
  ]);

  // Sum across branches per month, keep last 12 distinct months
  const monthMap = new Map<string, { income: number; expenses: number; net_profit: number }>();
  for (const row of rawMonthly ?? []) {
    const key = row.month as string;
    const existing = monthMap.get(key) ?? { income: 0, expenses: 0, net_profit: 0 };
    monthMap.set(key, {
      income:     existing.income     + Number(row.income),
      expenses:   existing.expenses   + Number(row.expenses),
      net_profit: existing.net_profit + Number(row.net_profit),
    });
  }
  const monthly = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, totals]) => ({ month, ...totals }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="kpi"><span className="kpi-label">Income (MTD)</span><span className="kpi-value">{formatMoney(pnl?.income ?? 0)}</span></div>
        <div className="kpi"><span className="kpi-label">Expenses (MTD)</span><span className="kpi-value">{formatMoney(pnl?.expenses ?? 0)}</span></div>
        <div className="kpi"><span className="kpi-label">Net Profit (MTD)</span><span className="kpi-value">{formatMoney(pnl?.net_profit ?? 0)}</span></div>
        <div className="kpi"><span className="kpi-label">Active Shareholders</span><span className="kpi-value">{shCount ?? 0}</span></div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Last 12 months (all branches combined)</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Income</th>
              <th className="text-right">Expenses</th>
              <th className="text-right">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.month}>
                <td>{new Date(m.month + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                <td className="text-right tabular-nums">{formatMoney(m.income)}</td>
                <td className="text-right tabular-nums">{formatMoney(m.expenses)}</td>
                <td className={`text-right tabular-nums font-medium ${m.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(m.net_profit)}
                </td>
              </tr>
            ))}
            {monthly.length === 0 && (
              <tr><td colSpan={4} className="text-slate-400 py-6 text-center">No transactions yet — add some in Transactions</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
