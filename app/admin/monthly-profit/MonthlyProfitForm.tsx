'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertMonthlyProfit } from '@/server/actions/monthly-profit';
import { allocateLargestRemainder } from '@/lib/accounting/allocate';
import { formatMoney } from '@/lib/utils';

type Branch = { id: string; name: string };
export type GroupMember = {
  branch_id: string;
  shareholder_id: string;
  display_name: string;
  ownership_pct: number;
};

export default function MonthlyProfitForm({
  branches,
  group,
}: {
  branches: Branch[];
  group: GroupMember[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('');
  const [amount, setAmount] = useState('');

  // Default to last month: a month's figure is known only once it has ended.
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  const members = useMemo(
    () => group.filter((m) => m.branch_id === branchId),
    [group, branchId],
  );
  // A branch with no tracked members has nobody to divide the figure between.
  const noMembers = Boolean(branchId) && members.length === 0;

  // The same largest-remainder split the distribution engine will compute,
  // shown as you type so the per-person amounts are visible before saving.
  const preview = useMemo(() => {
    const total = Number(amount);
    if (!branchId || !Number.isFinite(total) || total <= 0 || members.length === 0) return null;
    const weights = members.map((m) => Number(m.ownership_pct));
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    const amounts = allocateLargestRemainder(total, weights);
    return members.map((m, i) => ({
      name: m.display_name,
      share: (Number(m.ownership_pct) / weightTotal) * 100,
      amount: amounts[i],
    }));
  }, [amount, branchId, members]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      branch_id: fd.get('branch_id') as string,
      period_month: fd.get('period_month') as string,
      declared_amount: fd.get('declared_amount') as string,
      notes: (fd.get('notes') as string) || null,
    };
    start(async () => {
      const res = await upsertMonthlyProfit(payload);
      if (!res.ok) { setErr(res.error); return; }
      setOk('Saved.');
      form.reset();
      setAmount('');
      setBranchId('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
      <div className="md:col-span-2">
        <label className="label">Branch</label>
        <select
          className="input"
          name="branch_id"
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="" disabled>Select a branch</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Month</label>
        <input className="input" type="month" name="period_month" required defaultValue={defaultMonth} />
      </div>
      <div className="md:col-span-2">
        <label className="label">Amount for the group</label>
        <input
          className="input"
          type="number"
          step="0.01"
          name="declared_amount"
          required
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <button className="btn-primary w-full" disabled={pending || noMembers}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="md:col-span-6">
        <label className="label">Notes</label>
        <input className="input" name="notes" placeholder="optional" />
      </div>

      {branchId && members.length === 0 && (
        <div className="md:col-span-6 text-sm text-red-600">
          No tracked members in this branch, so there is nobody to divide the amount
          between. Add them on the Shareholders page first.
        </div>
      )}

      {preview && (
        <div className="md:col-span-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Splits as
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.map((p) => (
              <span
                key={p.name}
                className="inline-flex items-baseline gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-sm"
              >
                <b>{p.name}</b>
                <span className="tabular-nums">{formatMoney(p.amount)}</span>
                <span className="text-xs text-slate-400">{p.share.toFixed(2)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="md:col-span-6 text-xs text-slate-500">
        Enter what the group is owed for the month — not the branch&apos;s total profit.
        It is divided between the members above by their shares. Re-saving the same
        branch and month replaces the earlier figure, unless it has already been distributed.
      </p>
      {err && <div className="md:col-span-6 text-sm text-red-600">{err}</div>}
      {ok && <div className="md:col-span-6 text-sm text-emerald-700">{ok}</div>}
    </form>
  );
}
