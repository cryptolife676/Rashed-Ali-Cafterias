import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/utils';
import ShareholderForm from './ShareholderForm';

export const dynamic = 'force-dynamic';

type Shareholder = {
  id: string;
  display_name: string;
  ownership_pct: number | string;
  branch_id: string | null;
  profile_id: string | null;
  is_active: boolean;
};

export default async function ShareholdersPage() {
  const supabase = await createClient();
  const [{ data: shareholders }, { data: branches }, { data: summary }] = await Promise.all([
    supabase.from('shareholders').select('*').order('display_name'),
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    supabase.from('v_shareholder_summary').select('*'),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const sumByID = new Map((summary ?? []).map((r: { shareholder_id: string }) => [r.shareholder_id, r]));

  // Group active ownership totals by branch (each branch should sum ≤ 100)
  const totalsByBranch = new Map<string, number>();
  for (const s of (shareholders ?? []) as Shareholder[]) {
    if (!s.is_active) continue;
    const key = s.branch_id ?? '__no_branch__';
    totalsByBranch.set(key, (totalsByBranch.get(key) ?? 0) + Number(s.ownership_pct));
  }

  // Sort: by branch name, then display_name
  const sorted = ((shareholders ?? []) as Shareholder[]).slice().sort((a, b) => {
    const ba = branchName.get(a.branch_id ?? '') ?? '';
    const bb = branchName.get(b.branch_id ?? '') ?? '';
    if (ba !== bb) return ba.localeCompare(bb);
    return a.display_name.localeCompare(b.display_name);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Shareholders</h1>

      <div className="card">
        <h2 className="font-semibold mb-3">Ownership totals per branch</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {Array.from(totalsByBranch.entries()).map(([bid, pct]) => {
            const name = bid === '__no_branch__' ? '(no branch)' : branchName.get(bid) ?? bid;
            const isOk = Math.abs(pct - 100) < 0.01;
            return (
              <div key={bid} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-slate-700">{name}</span>
                <span className={`tabular-nums font-medium ${isOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {pct.toFixed(2)}%
                </span>
              </div>
            );
          })}
          {totalsByBranch.size === 0 && <div className="text-slate-400">No active shareholders.</div>}
        </div>
      </div>

      <ShareholderForm branches={branches ?? []} />

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th><th>Branch</th><th className="text-right">%</th>
              <th className="text-right">Invested</th><th className="text-right">Profit</th>
              <th className="text-right">Withdrawn</th>
              <th>Login</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const sm = sumByID.get(s.id) as
                | { total_invested?: number | string; total_profit_earned?: number | string; total_withdrawn?: number | string }
                | undefined;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="font-medium">
                    <Link className="text-brand-700 hover:underline" href={`/admin/shareholders/${s.id}`}>
                      {s.display_name}
                    </Link>
                  </td>
                  <td className="text-slate-500">{branchName.get(s.branch_id ?? '') ?? '—'}</td>
                  <td className="text-right tabular-nums">{Number(s.ownership_pct).toFixed(2)}%</td>
                  <td className="text-right tabular-nums">{formatMoney(sm?.total_invested ?? 0)}</td>
                  <td className="text-right tabular-nums">{formatMoney(sm?.total_profit_earned ?? 0)}</td>
                  <td className="text-right tabular-nums">{formatMoney(sm?.total_withdrawn ?? 0)}</td>
                  <td className="text-xs">{s.profile_id ? <span className="text-emerald-700">linked</span> : <span className="text-amber-600">none</span>}</td>
                  <td>{s.is_active ? <span className="text-emerald-700 text-xs">active</span> : <span className="text-slate-400 text-xs">inactive</span>}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={8} className="text-slate-400 py-6 text-center">No shareholders</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
