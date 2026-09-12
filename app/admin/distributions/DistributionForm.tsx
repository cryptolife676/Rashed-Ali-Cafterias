'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDistributionRun } from '@/server/actions/distributions';

type Branch = { id: string; name: string };

export default function DistributionForm({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Default to last month — the most recent month whose profit can be known.
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      branch_id: fd.get('branch_id') as string,
      period_month: fd.get('period_month') as string,
      notes: (fd.get('notes') as string) || null,
    };
    start(async () => {
      const res = await createDistributionRun(payload);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
      <div>
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
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <input className="input" name="notes" />
      </div>
      <button className="btn-primary md:col-span-1 col-span-full" disabled={pending}>
        {pending ? 'Computing…' : 'Create draft run'}
      </button>
      <p className="md:col-span-5 text-xs text-slate-500">
        Splits the profit declared for this branch and month across its active
        shareholders by ownership percentage.
      </p>
      {err && <div className="md:col-span-5 text-sm text-red-600">{err}</div>}
    </form>
  );
}
