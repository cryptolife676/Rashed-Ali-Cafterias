'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordWithdrawal, deleteWithdrawal } from '@/server/actions/shareholders';
import { formatMoney, formatDate } from '@/lib/utils';

type Withdrawal = {
  id: string;
  amount: number | string;
  withdrawn_at: string;
  source: string;
  notes: string | null;
};

export default function WithdrawalManager({
  shareholderId,
  withdrawals,
}: {
  shareholderId: string;
  withdrawals: Withdrawal[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      shareholder_id: shareholderId,
      amount: fd.get('amount') as string,
      withdrawn_at: fd.get('withdrawn_at') as string,
      notes: (fd.get('notes') as string) || null,
    };
    start(async () => {
      const res = await recordWithdrawal(payload);
      if (!res.ok) { setErr(res.error); return; }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm('Delete this withdrawal record?')) return;
    start(async () => {
      const res = await deleteWithdrawal(id);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAdd} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-slate-50 rounded-lg p-3">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" name="withdrawn_at" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">Amount (AED)</label>
          <input className="input" type="number" step="0.01" min="0.01" name="amount" required />
        </div>
        <div className="md:col-span-2">
          <label className="label">Notes</label>
          <input className="input" name="notes" />
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Add withdrawal'}</button>
      </form>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <table className="tbl">
        <thead>
          <tr><th>Date</th><th>Source</th><th className="text-right">Amount</th><th>Notes</th><th className="text-right">Actions</th></tr>
        </thead>
        <tbody>
          {withdrawals.map((w) => (
            <tr key={w.id}>
              <td>{formatDate(w.withdrawn_at)}</td>
              <td className="text-slate-500">{w.source}</td>
              <td className="text-right tabular-nums">{formatMoney(w.amount)}</td>
              <td className="text-slate-500">{w.notes ?? '—'}</td>
              <td className="text-right">
                {w.source === 'manual' ? (
                  <button type="button" className="text-red-600 text-sm hover:underline" onClick={() => onDelete(w.id)}>Delete</button>
                ) : (
                  <span className="text-xs text-slate-400">from distribution</span>
                )}
              </td>
            </tr>
          ))}
          {withdrawals.length === 0 && (
            <tr><td colSpan={5} className="text-slate-400 py-4 text-center">No withdrawals yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
