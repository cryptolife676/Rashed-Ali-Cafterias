'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertMonthlyProfit } from '@/server/actions/monthly-profit';

type Branch = { id: string; name: string };

export default function MonthlyProfitForm({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Default to last month: a month's profit is known only once it has ended.
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      branch_id: fd.get('branch_id') as string,
      period_month: fd.get('period_month') as string,
      net_profit: fd.get('net_profit') as string,
      gross_income: fd.get('gross_income') as string,
      total_expenses: fd.get('total_expenses') as string,
      notes: (fd.get('notes') as string) || null,
    };
    start(async () => {
      const res = await upsertMonthlyProfit(payload);
      if (!res.ok) { setErr(res.error); return; }
      setOk('Monthly profit saved.');
      form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
      <div className="md:col-span-2">
        <label className="label">Branch</label>
        <select className="input" name="branch_id" required defaultValue="">
          <option value="" disabled>Select a branch</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Month</label>
        <input className="input" type="month" name="period_month" required defaultValue={defaultMonth} />
      </div>
      <div>
        <label className="label">Net profit</label>
        <input className="input" type="number" step="0.01" name="net_profit" required placeholder="0.00" />
      </div>
      <div>
        <label className="label">Income <span className="text-slate-400 font-normal">(optional)</span></label>
        <input className="input" type="number" step="0.01" min="0" name="gross_income" />
      </div>
      <div>
        <label className="label">Expenses <span className="text-slate-400 font-normal">(optional)</span></label>
        <input className="input" type="number" step="0.01" min="0" name="total_expenses" />
      </div>
      <div className="md:col-span-5">
        <label className="label">Notes</label>
        <input className="input" name="notes" placeholder="optional" />
      </div>
      <div>
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? 'Saving…' : 'Save profit'}
        </button>
      </div>
      <p className="md:col-span-6 text-xs text-slate-500">
        Enter the profit figure the branch reported for the month. Re-saving the same
        branch and month replaces the earlier figure, unless it has already been distributed.
      </p>
      {err && <div className="md:col-span-6 text-sm text-red-600">{err}</div>}
      {ok && <div className="md:col-span-6 text-sm text-emerald-700">{ok}</div>}
    </form>
  );
}
