'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, formatDate } from '@/lib/utils';
import { round2 } from '@/lib/accounting/allocate';
import { adjustDistributionItem } from '@/server/actions/distributions';

export type RunItem = {
  id: string;
  name: string;
  pct: number;
  computed: number;
  adjustment: number;
  final: number;
  paidAt: string | null;
};

/**
 * A run's per-member breakdown. Read-only unless the run is still a draft
 * and the viewer is an admin — matching adjustDistributionItem, which
 * refuses anything past draft.
 */
export default function RunItems({
  items,
  declared,
  editable,
}: {
  items: RunItem[];
  declared: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const value = (it: RunItem) =>
    edits[it.id] !== undefined ? edits[it.id] : String(it.adjustment);

  const rows = items.map((it) => {
    const adj = Number(value(it));
    const valid = Number.isFinite(adj);
    return { ...it, adj: valid ? adj : 0, valid, liveFinal: round2(it.computed + (valid ? adj : 0)) };
  });

  const dirty = rows.filter((r) => round2(r.adj) !== round2(r.adjustment));
  const anyInvalid = rows.some((r) => !r.valid);

  // Adjustments do not have to cancel out, so the payout total can drift from
  // the declared figure. That is a real accounting difference — show it rather
  // than let someone pay out more than the branch reported without noticing.
  const total = useMemo(() => round2(rows.reduce((a, r) => a + r.liveFinal, 0)), [rows]);
  const diff = round2(total - declared);

  function save() {
    if (dirty.length === 0 || anyInvalid) return;
    setMsg(null);
    start(async () => {
      for (const r of dirty) {
        const res = await adjustDistributionItem({
          item_id: r.id,
          manual_adjustment: r.adj,
        });
        if (!res.ok) { setMsg({ type: 'err', text: `${r.name}: ${res.error}` }); return; }
      }
      setEdits({});
      setMsg({ type: 'ok', text: `Saved ${dirty.length} adjustment(s).` });
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th className="text-right">%</th>
              <th className="text-right">Computed</th>
              <th className="text-right">Adjustment</th>
              <th className="text-right">Final</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="text-right">{Number(r.pct).toFixed(2)}%</td>
                <td className="text-right tabular-nums">{formatMoney(r.computed)}</td>
                <td className="text-right tabular-nums">
                  {editable ? (
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Adjustment for ${r.name}`}
                      className={`input text-right py-1.5 w-32 ml-auto ${r.valid ? '' : 'border-red-400'}`}
                      value={value(r)}
                      onChange={(e) => setEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                  ) : (
                    formatMoney(r.adjustment)
                  )}
                </td>
                <td className="text-right tabular-nums font-medium">{formatMoney(r.liveFinal)}</td>
                <td>{r.paidAt ? formatDate(r.paidAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          Payout total: <b className="tabular-nums">{formatMoney(total)}</b>
        </span>
        <span className="text-slate-500">
          Declared: <b className="tabular-nums">{formatMoney(declared)}</b>
        </span>
        {diff !== 0 && (
          <span className="text-amber-700 font-medium">
            {diff > 0 ? 'Paying out ' : 'Paying out '}
            <b className="tabular-nums">{formatMoney(Math.abs(diff))}</b>
            {diff > 0 ? ' more than declared' : ' less than declared'}
          </span>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={pending || dirty.length === 0 || anyInvalid}
            onClick={save}
          >
            {pending ? 'Saving…' : `Save adjustments${dirty.length ? ` (${dirty.length})` : ''}`}
          </button>
          {dirty.length > 0 && (
            <button className="btn-secondary" disabled={pending} onClick={() => setEdits({})}>
              Discard changes
            </button>
          )}
          <p className="text-xs text-slate-500">
            Adjustments can only be made while the run is a draft. Use a negative
            number to reduce someone&apos;s share.
          </p>
        </div>
      )}

      {msg && (
        <div className={`text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
