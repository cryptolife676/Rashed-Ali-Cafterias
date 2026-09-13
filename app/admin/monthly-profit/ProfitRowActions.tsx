'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/utils';
import { updateMonthlyProfit, deleteMonthlyProfit } from '@/server/actions/monthly-profit';

/**
 * Inline edit + delete for one declared month.
 *
 * Editing corrects the figure in place, which is what you want once the month
 * is already in the list; the form above is for declaring a new one. Both are
 * hidden once the month is locked into an approved run.
 */
export default function ProfitRowActions({
  profitId,
  label,
  locked,
  amount,
  notes,
}: {
  profitId: string;
  label: string;
  locked: boolean;
  amount: number;
  notes: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(amount));
  const [note, setNote] = useState(notes ?? '');

  if (locked) return null;

  function onSave() {
    setErr(null);
    start(async () => {
      const res = await updateMonthlyProfit({
        id: profitId,
        declared_amount: value,
        notes: note || null,
      });
      if (!res.ok) { setErr(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete the declared amount for ${label}?`)) return;
    setErr(null);
    start(async () => {
      const res = await deleteMonthlyProfit(profitId);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 min-w-[14rem]">
        <input
          type="number"
          step="0.01"
          aria-label={`Amount for ${label}`}
          className="input py-1.5 text-right"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <input
          type="text"
          aria-label={`Notes for ${label}`}
          placeholder="notes"
          className="input py-1.5"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-primary text-xs py-1.5" disabled={pending} onClick={onSave}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn-secondary text-xs py-1.5"
            disabled={pending}
            onClick={() => { setEditing(false); setValue(String(amount)); setNote(notes ?? ''); setErr(null); }}
          >
            Cancel
          </button>
        </div>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>
    );
  }

  return (
    <div className="flex gap-3 whitespace-nowrap">
      <button
        className="text-xs text-brand-700 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={() => setEditing(true)}
        title={`Currently ${formatMoney(amount)}`}
      >
        Edit
      </button>
      <button
        className="text-xs text-red-600 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={onDelete}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  );
}
