import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, Users, type LucideIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Pnl = { income: number; expenses: number; net_profit: number };

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Active branches
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, location')
    .eq('is_active', true)
    .order('name');

  // Per-branch month-to-date P&L + active shareholder count
  const branchData = await Promise.all(
    (branches ?? []).map(async (b) => {
      const [{ data: pnl }, { count: shCount }] = await Promise.all([
        supabase
          .rpc('compute_period_pnl', { p_branch: b.id, p_start: start, p_end: end })
          .single<Pnl>(),
        supabase
          .from('shareholders')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('branch_id', b.id),
      ]);
      return {
        id: b.id as string,
        name: b.name as string,
        location: (b.location as string | null) ?? null,
        income: Number(pnl?.income ?? 0),
        expenses: Number(pnl?.expenses ?? 0),
        net: Number(pnl?.net_profit ?? 0),
        shCount: shCount ?? 0,
      };
    }),
  );

  // Combined totals across branches
  const totals = branchData.reduce(
    (a, b) => ({
      income: a.income + b.income,
      expenses: a.expenses + b.expenses,
      net: a.net + b.net,
      sh: a.sh + b.shCount,
    }),
    { income: 0, expenses: 0, net: 0, sh: 0 },
  );

  // Last 12 months (all branches combined)
  const { data: rawMonthly } = await supabase
    .from('v_monthly_pnl')
    .select('month, income, expenses, net_profit')
    .order('month', { ascending: false })
    .limit(60);

  const monthMap = new Map<string, { income: number; expenses: number; net_profit: number }>();
  for (const row of rawMonthly ?? []) {
    const key = row.month as string;
    const ex = monthMap.get(key) ?? { income: 0, expenses: 0, net_profit: 0 };
    monthMap.set(key, {
      income: ex.income + Number(row.income),
      expenses: ex.expenses + Number(row.expenses),
      net_profit: ex.net_profit + Number(row.net_profit),
    });
  }
  const monthly = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, t]) => ({ month, ...t }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Combined KPIs (all branches) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="kpi"><span className="kpi-label">Income (MTD)</span><span className="kpi-value">{formatMoney(totals.income)}</span></div>
        <div className="kpi"><span className="kpi-label">Expenses (MTD)</span><span className="kpi-value">{formatMoney(totals.expenses)}</span></div>
        <div className="kpi"><span className="kpi-label">Net Profit (MTD)</span><span className="kpi-value">{formatMoney(totals.net)}</span></div>
        <div className="kpi"><span className="kpi-label">Active Shareholders</span><span className="kpi-value">{totals.sh}</span></div>
      </div>

      {/* Per-branch cards */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-3">
          By Branch · This Month
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {branchData.map((b) => (
            <div key={b.id} className="card">
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  This month
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{b.name}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {b.location ?? '—'} · <b>{b.shCount}</b> shareholders
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Tile icon={TrendingUp}   tone="green" label="Income"       value={formatMoney(b.income)} />
                <Tile icon={TrendingDown} tone="red"   label="Expenses"     value={formatMoney(b.expenses)} />
                <Tile
                  icon={Wallet}
                  tone="blue"
                  label="Net Profit"
                  value={formatMoney(b.net)}
                  valueClass={b.net >= 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <Tile icon={Users} tone="gold" label="Shareholders" value={String(b.shCount)} />
              </div>
            </div>
          ))}
          {branchData.length === 0 && (
            <div className="card text-slate-400 text-sm">No active branches yet.</div>
          )}
        </div>
      </section>

      {/* Last 12 months */}
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

function Tile({
  icon: Icon,
  label,
  value,
  tone,
  valueClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: 'green' | 'red' | 'blue' | 'gold';
  valueClass?: string;
}) {
  const tones: Record<string, string> = {
    green: 'text-emerald-600 bg-emerald-50',
    red: 'text-rose-600 bg-rose-50',
    blue: 'text-sky-600 bg-sky-50',
    gold: 'text-amber-600 bg-amber-50',
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${valueClass ?? 'text-slate-900'}`}>
        {value}
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}
