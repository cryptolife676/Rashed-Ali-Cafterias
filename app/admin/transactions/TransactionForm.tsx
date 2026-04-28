'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTransaction } from '@/server/actions/transactions';

type Cat = { id: string; kind: 'income' | 'expense'; name: string };
type Branch = { id: string; name: string };

export default function TransactionForm({ categories, branches }: { categories: Cat[]; branches: Branch[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<'income' | 'expense'>('income');
  const filtered = categories.filter((c) => c.kind === kind);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      kind,
      branch_id: (fd.get('branch_id') as string) || null,
      category_id: (fd.get('category_id') as string) || null,
      entry_date: fd.get('entry_date') as string,
      amount: fd.get('amount') as string,
      notes: (fd.get('notes') as string) || null,
    };
    start(async () => {
      const res = await createTransaction(payload);
      if (!res.ok) { setErr(res.error); return; }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
      <div>
        <label className="label">Kind</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'income' | 'expense')}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>
      <div>
        <label className="label">Date</label>
        <input className="input" type="date" name="entry_date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div>
        <label className="label">Amount</label>
        <input className="input" type="number" step="0.01" min="0.01" name="amount" required />
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" name="category_id">
          <option value="">—</option>
          {filtered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Branch</label>
        <select className="input" name="branch_id">
          <option value="">—</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <button className="btn-primary w-full" disabled={pending}>{pending ? 'Saving…' : 'Add transaction'}</button>
      </div>
      <div className="md:col-span-6">
        <label className="label">Notes</label>
        <input className="input" name="notes" placeholder="optional" />
      </div>
      {err && <div className="md:col-span-6 text-sm text-red-600">{err}</div>}
    </form>
  );
}
