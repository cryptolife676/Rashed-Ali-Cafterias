'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  recordInvestment,
  updateInvestment,
  deleteInvestment,
} from '@/server/actions/shareholders';
import { formatMoney, formatDate } from '@/lib/utils';

type Investment = {
  id: string;
  amount: number | string;
  invested_at: string;
  notes: string | null;
  branch_id?: string | null;
  // Supabase returns joined rows as array; treat as unknown then cast
  branch?: unknown;
};
type Branch = { id: string; name: string };

export default function InvestmentManager({
  shareholderId,
  investments,
  branches,
}: {
  shareholderId: string;
  investments: Investment[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      shareholder_id: shareholderId,
      amount: fd.get('amount') as string,
      invested_at: fd.get('invested_at') as string,
      notes: (fd.get('notes') as string) || null,
      branch_id: (fd.get('branch_id') as string) || null,
    };
    start(async () => {
      const res = await recordInvestment(payload);
      if (!res.ok) { setErr(res.error); return; }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  function onSaveEdit(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateInvestment(id, {
        amount: fd.get('amount') as string,
        invested_at: fd.get('invested_at') as string,
        notes: (fd.get('notes') as string) || null,
        branch_id: (fd.get('branch_id') as string) || null,
      });
      if (!res.ok) { setErr(res.error); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm('Delete this investment record?')) return;
    start(async () => {
      const res = await deleteInvestment(id);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAdd} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-slate-50 rounded-lg p-3">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" name="invested_at" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">Amount (AED)</label>
          <input className="input" type="number" step="0.01" min="0.01" name="amount" required />
        </div>
        <div>
          <label className="label">Actual branch</label>
          <select className="input" name="branch_id">
            <option value="">Same as shareholder</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Notes (e.g. C/O Mukthar)</label>
          <input className="input" name="notes" />
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button>
      </form>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th><th>Branch</th><th className="text-right">Amount</th><th>Notes</th><th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {investments.map((inv) => (
            <tr key={inv.id}>
              {editingId === inv.id ? (
                <td colSpan={5}>
                  <form onSubmit={(e) => onSaveEdit(e, inv.id)} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end p-2">
                    <div>
                      <label className="label">Date</label>
                      <input className="input" type="date" name="invested_at" defaultValue={inv.invested_at} required />
                    </div>
                    <div>
                      <label className="label">Amount</label>
                      <input className="input" type="number" step="0.01" min="0.01" name="amount" defaultValue={String(inv.amount)} required />
                    </div>
                    <div>
                      <label className="label">Actual branch</label>
                      <select className="input" name="branch_id" defaultValue={inv.branch_id ?? ''}>
                        <option value="">Same as shareholder</option>
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Notes</label>
                      <input className="input" name="notes" defaultValue={inv.notes ?? ''} />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn-primary" disabled={pending}>Save</button>
                    </div>
                  </form>
                </td>
              ) : (
                <>
                  <td>{formatDate(inv.invested_at)}</td>
                  <td className="text-slate-500">{(inv.branch as { name: string } | null)?.name ?? '(same as shareholder)'}</td>
                  <td className="text-right tabular-nums">{formatMoney(inv.amount)}</td>
                  <td className="text-slate-500 truncate max-w-xs">{inv.notes ?? '—'}</td>
                  <td className="text-right">
                    <button type="button" className="text-brand-600 text-sm hover:underline mr-3" onClick={() => setEditingId(inv.id)}>Edit</button>
                    <button type="button" className="text-red-600 text-sm hover:underline" onClick={() => onDelete(inv.id)}>Delete</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {investments.length === 0 && (
            <tr><td colSpan={5} className="text-slate-400 py-4 text-center">No investments yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
