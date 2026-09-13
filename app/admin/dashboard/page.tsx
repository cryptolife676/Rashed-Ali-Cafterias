import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatMonth } from '@/lib/utils';
import { getTeamByBranch } from '@/lib/team';
import { minMonth, nextMonth, previousMonthDubai } from '@/lib/months';
import ProfitEntryForm, { type DeclaredMonth } from '@/components/ProfitEntryForm';
import { Wallet, Users, type LucideIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

type DeclaredAmount = {
  branch_id: string;
  period_month: string;
  declared_amount: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  // The latest month any branch has declared. Profit is reported after a month
  // closes, so "this month" is almost always empty — showing the most recent
  // declared month is what an admin actually wants to see.
  const { data: latest } = await supabase
    .from('monthly_profits')
    .select('period_month')
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle<{ period_month: string }>();
  const latestMonth = latest?.period_month ?? null;

  // Active branches
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, location')
    .eq('is_active', true)
    .order('name');

  // The team per branch comes through the security-definer lookup. Counting
  // shareholders directly is filtered by RLS to the caller's own rows, which
  // showed Shabeer 0 members everywhere and blocked his entries.
  const branchIds = (branches ?? []).map((b) => b.id as string);
  const [team, { data: allDeclared }] = await Promise.all([
    getTeamByBranch(supabase, branchIds),
    supabase
      .from('monthly_profits')
      .select('branch_id, period_month, declared_amount, is_locked')
      .order('period_month', { ascending: false }),
  ]);
  const declaredList: DeclaredMonth[] = (allDeclared ?? []).map((d) => ({
    branch_id: d.branch_id as string,
    period_month: d.period_month as string,
    declared_amount: Number(d.declared_amount),
    is_locked: Boolean(d.is_locked),
  }));
  const lastMonth = previousMonthDubai();

  // Declared figures for that month, all branches in one read
  const { data: declared } = latestMonth
    ? await supabase
        .from('monthly_profits')
        .select('branch_id, period_month, declared_amount')
        .eq('period_month', latestMonth)
    : { data: [] as DeclaredAmount[] };

  const byBranch = new Map<string, DeclaredAmount>(
    ((declared ?? []) as DeclaredAmount[]).map((d) => [d.branch_id, d]),
  );

  // Per-branch declared profit + active shareholder count
  const branchData = await Promise.all(
    (branches ?? []).map(async (b) => {
      // Team members only — the people the declared figure is split between.
      const shCount = team.filter((m) => m.branch_id === b.id).length;
      const d = byBranch.get(b.id as string);
      return {
        id: b.id as string,
        name: b.name as string,
        location: (b.location as string | null) ?? null,
        declared: Boolean(d),
        net: Number(d?.declared_amount ?? 0),
        shCount: shCount ?? 0,
      };
    }),
  );

  // Combined totals across branches
  const totals = branchData.reduce(
    (a, b) => ({
      net: a.net + b.net,
      sh: a.sh + b.shCount,
      declared: a.declared + (b.declared ? 1 : 0),
    }),
    { net: 0, sh: 0, declared: 0 },
  );

  // Last 12 months (all branches combined)
  const { data: rawMonthly } = await supabase
    .from('v_monthly_pnl')
    .select('month, declared_amount')
    .order('month', { ascending: false })
    .limit(60);

  const monthMap = new Map<string, number>();
  for (const row of rawMonthly ?? []) {
    const key = row.month as string;
    monthMap.set(key, (monthMap.get(key) ?? 0) + Number(row.declared_amount));
  }
  const monthly = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, total]) => ({ month, total }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Entering the month's figure is why Shabeer opens the site, so it
          comes first: one card per cafeteria, month already suggested. */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-3">
          Enter monthly profit
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {(branches ?? []).map((b) => {
            const id = b.id as string;
            const hasTeam = team.some((m) => m.branch_id === id);
            // declaredList is newest first, so the first match is the latest.
            const latest = declaredList.find((d) => d.branch_id === id);
            const suggested = latest
              ? minMonth(nextMonth(latest.period_month.slice(0, 7)), lastMonth)
              : lastMonth;
            return (
              <div key={id} className="card space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{b.name as string}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {latest ? (
                      <>
                        Last entered: <b>{formatMonth(latest.period_month)}</b> ·{' '}
                        {formatMoney(latest.declared_amount)}
                      </>
                    ) : (
                      'Nothing entered yet'
                    )}
                  </p>
                </div>
                {hasTeam ? (
                  <ProfitEntryForm
                    compact
                    branches={[{ id, name: b.name as string }]}
                    fixedBranchId={id}
                    team={team}
                    declared={declaredList}
                    defaultMonth={suggested}
                    maxMonth={lastMonth}
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    No team members in this branch yet, so there is nothing to enter here.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Combined KPIs (all branches) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi">
          <span className="kpi-label">
            Declared{latestMonth ? ` · ${formatMonth(latestMonth)}` : ''}
          </span>
          <span className="kpi-value">{formatMoney(totals.net)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Branches Reported</span>
          <span className="kpi-value">{totals.declared} / {branchData.length}</span>
        </div>
        <div className="kpi"><span className="kpi-label">Tracked Members</span><span className="kpi-value">{totals.sh}</span></div>
      </div>

      {/* Per-branch cards */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-3">
          By Branch{latestMonth ? ` · ${formatMonth(latestMonth)}` : ''}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {branchData.map((b) => (
            <div key={b.id} className="card">
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  {latestMonth ? formatMonth(latestMonth) : 'No month declared'}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{b.name}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {b.location ?? '—'} · <b>{b.shCount}</b> team members
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Net profit leads: it is the declared figure everything derives
                    from. Income and expenses are optional context, shown only
                    when the branch actually reported them. */}
                <Tile
                  icon={Wallet}
                  tone="blue"
                  label="Declared for the group"
                  value={b.declared ? formatMoney(b.net) : 'Not reported'}
                  valueClass={
                    !b.declared ? 'text-slate-400' : b.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }
                />
                <Tile icon={Users} tone="gold" label="Tracked members" value={String(b.shCount)} />
              </div>
              {!b.declared && (
                <Link
                  href="/admin/monthly-profit"
                  className="mt-3 inline-block text-xs text-brand-700 hover:underline"
                >
                  Declare this branch&apos;s profit →
                </Link>
              )}
            </div>
          ))}
          {branchData.length === 0 && (
            <div className="card text-slate-400 text-sm">No active branches yet.</div>
          )}
        </div>
      </section>

      {/* Last 12 months */}
      <div className="card">
        <h2 className="font-semibold mb-3">Declared by month (all branches combined)</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Amount for the group</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.month}>
                <td>{formatMonth(m.month)}</td>
                <td className={`text-right tabular-nums font-medium ${m.total >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(m.total)}
                </td>
              </tr>
            ))}
            {monthly.length === 0 && (
              <tr><td colSpan={2} className="text-slate-400 py-6 text-center">Nothing declared yet — add a month in Monthly Profit</td></tr>
            )}
          </tbody>
          {monthly.length > 0 && (
            <tfoot>
              <tr>
                <td>Total ({monthly.length} months)</td>
                <td className="text-right tabular-nums">
                  {formatMoney(monthly.reduce((a, m) => a + m.total, 0))}
                </td>
              </tr>
            </tfoot>
          )}
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
