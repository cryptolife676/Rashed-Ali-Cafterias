'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateShareholder, deleteShareholder, deactivateShareholder } from '@/server/actions/shareholders';

type Props = {
  shareholder: {
    id: string;
    display_name: string;
    ownership_pct: number;
    branch_id: string | null;
    is_active: boolean;
  };
  branches: { id: string; name: string }[];
};

export default function EditShareholderForm({ shareholder, branches }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: shareholder.id,
      display_name: fd.get('display_name') as string,
      ownership_pct: fd.get('ownership_pct') as string,
      branch_id: (fd.get('branch_id') as string) || null,
      is_active: fd.get('is_active') === 'on',
    };
    start(async () => {
      const res = await updateShareholder(payload);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setMsg({ type: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Permanently delete "${shareholder.display_name}"? Investments and withdrawals will also be removed.`)) return;
    start(async () => {
      const res = await deleteShareholder(shareholder.id);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      router.replace('/admin/shareholders');
    });
  }

  function onDeactivate() {
    if (!confirm('Deactivate this shareholder? They will be excluded from new distributions.')) return;
    start(async () => {
      const res = await deactivateShareholder(shareholder.id);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div className="md:col-span-2">
        <label className="label">Display name</label>
        <input className="input" name="display_name" defaultValue={shareholder.display_name} required />
      </div>
      <div>
        <label className="label">Ownership %</label>
        <input
          className="input"
          name="ownership_pct"
          type="number"
          step="0.0001"
          min="0.0001"
          max="100"
          defaultValue={shareholder.ownership_pct}
          required
        />
      </div>
      <div>
        <label className="label">Branch</label>
        <select className="input" name="branch_id" defaultValue={shareholder.branch_id ?? ''}>
          <option value="">—</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={shareholder.is_active} />
        Active
      </label>
      <div className="md:col-span-3 flex gap-2 justify-end">
        <button type="button" className="btn-secondary" disabled={pending} onClick={onDeactivate}>Deactivate</button>
        <button type="button" className="btn-danger" disabled={pending} onClick={onDelete}>Delete</button>
        <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>
      </div>
      {msg && (
        <div className={`md:col-span-4 text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}
    </form>
  );
}
