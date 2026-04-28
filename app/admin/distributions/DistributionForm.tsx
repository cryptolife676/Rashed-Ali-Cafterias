'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDistributionRun } from '@/server/actions/distributions';

type Branch = { id: string; name: string };

export default function DistributionForm({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const today = new Date();
  const startDef = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const endDef = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      branch_id: (fd.get('branch_id') as string) || null,
      period_start: fd.get('period_start') as string,
      period_end: fd.get('period_end') as string,
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
        <label className="label">Period start</label>
        <input className="input" type="date" name="period_start" required defaultValue={startDef} />
      </div>
      <div>
        <label className="label">Period end</label>
        <input className="input" type="date" name="period_end" required defaultValue={endDef} />
      </div>
      <div>
        <label className="label">Branch</label>
        <select className="input" name="branch_id">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <input className="input" name="notes" />
      </div>
      <button className="btn-primary md:col-span-1 col-span-full" disabled={pending}>
        {pending ? 'Computing…' : 'Create draft run'}
      </button>
      {err && <div className="md:col-span-5 text-sm text-red-600">{err}</div>}
    </form>
  );
}
