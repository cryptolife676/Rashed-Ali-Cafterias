'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createShareholder } from '@/server/actions/shareholders';

type Branch = { id: string; name: string };

export default function ShareholderForm({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      display_name: fd.get('display_name') as string,
      ownership_pct: fd.get('ownership_pct') as string,
      branch_id: (fd.get('branch_id') as string) || null,
    };
    start(async () => {
      const res = await createShareholder(payload);
      if (!res.ok) { setErr(res.error); return; }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div>
        <label className="label">Display name</label>
        <input className="input" name="display_name" required />
      </div>
      <div>
        <label className="label">Ownership %</label>
        <input className="input" name="ownership_pct" type="number" step="0.01" min="0.01" max="100" required />
      </div>
      <div>
        <label className="label">Branch</label>
        <select className="input" name="branch_id">
          <option value="">—</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Add shareholder'}</button>
      {err && <div className="md:col-span-4 text-sm text-red-600">{err}</div>}
    </form>
  );
}
