import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { formatMoney } from '@/lib/utils';
import EditShareholderForm from './EditShareholderForm';
import InvestmentManager from './InvestmentManager';
import WithdrawalManager from './WithdrawalManager';

export const dynamic = 'force-dynamic';

export default async function ShareholderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: sh }, { data: branches }, { data: investments }, { data: withdrawals }, { data: summary }] = await Promise.all([
    supabase
      .from('shareholders')
      .select('id, display_name, ownership_pct, branch_id, profile_id, is_active, joined_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('branches').select('id, name').order('name'),
    supabase
      .from('investments')
      .select('id, amount, invested_at, notes, branch_id, branch:branches(name)')
      .eq('shareholder_id', id)
      .order('invested_at', { ascending: false }),
    supabase
      .from('withdrawals')
      .select('id, amount, withdrawn_at, source, notes')
      .eq('shareholder_id', id)
      .order('withdrawn_at', { ascending: false }),
    supabase
      .from('v_shareholder_summary')
      .select('total_invested, total_profit_earned, total_withdrawn')
      .eq('shareholder_id', id)
      .maybeSingle(),
  ]);

  if (!sh) notFound();

  const branchName = branches?.find((b) => b.id === sh.branch_id)?.name ?? '—';
  const balance =
    Number(summary?.total_invested ?? 0) +
    Number(summary?.total_profit_earned ?? 0) -
    Number(summary?.total_withdrawn ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Link href="/admin/shareholders" className="text-brand-600 hover:underline">← Back to shareholders</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{sh.display_name}</h1>
          <div className="text-sm text-slate-500">
            Branch: <b>{branchName}</b> · Ownership: <b>{Number(sh.ownership_pct).toFixed(2)}%</b>
            {!sh.is_active && <span className="ml-2 text-slate-400">(inactive)</span>}
          </div>
          {!sh.profile_id && (
            <div className="text-xs text-amber-600 mt-1">⚠ No login linked — this person can&apos;t access their portfolio yet.</div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="kpi"><span className="kpi-label">Invested</span><span className="kpi-value text-base">{formatMoney(summary?.total_invested ?? 0)}</span></div>
          <div className="kpi"><span className="kpi-label">Profit</span><span className="kpi-value text-base">{formatMoney(summary?.total_profit_earned ?? 0)}</span></div>
          <div className="kpi"><span className="kpi-label">Balance</span><span className="kpi-value text-base">{formatMoney(balance)}</span></div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Edit shareholder</h2>
        <EditShareholderForm
          shareholder={{
            id: sh.id,
            display_name: sh.display_name,
            ownership_pct: Number(sh.ownership_pct),
            branch_id: sh.branch_id,
            is_active: sh.is_active,
          }}
          branches={branches ?? []}
        />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Investments</h2>
        <InvestmentManager shareholderId={sh.id} investments={investments ?? []} branches={branches ?? []} />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Withdrawals</h2>
        <WithdrawalManager shareholderId={sh.id} withdrawals={withdrawals ?? []} />
      </div>

    </div>
  );
}
