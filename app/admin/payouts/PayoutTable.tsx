'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, formatMonth, formatDate } from '@/lib/utils';
import { payDistributionItems, unpayDistributionItem } from '@/server/actions/payouts';

export type PayoutRow = {
  itemId: string;
  shareholderId: string;
  member: string;
  branch: string;
  month: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
  remarks: string | null;
  viaProfileId: string | null;
  viaName: string | null;
};

export default function PayoutTable({
  rows,
  currentUserId,
  currentUserName,
}: {
  rows: PayoutRow[];
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  // Handovers are usually ticked some days after the cash changed hands, so
  // the date is asked for rather than assumed to be today.
  const [paidOn, setPaidOn] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [remarks, setRemarks] = useState('');

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mineOnly || r.viaProfileId === currentUserId) &&
          (showPaid || !r.paid),
      ),
    [rows, mineOnly, showPaid, currentUserId],
  );

  // Totals always reflect the active filter, so "remaining" answers the
  // question the filter asked ("how much do I still owe?").
  const scope = useMemo(
    () => rows.filter((r) => !mineOnly || r.viaProfileId === currentUserId),
    [rows, mineOnly, currentUserId],
  );
  const totals = useMemo(() => {
    const payable = scope.reduce((a, r) => a + r.amount, 0);
    const forwarded = scope.filter((r) => r.paid).reduce((a, r) => a + r.amount, 0);
    return { payable, forwarded, remaining: payable - forwarded };
  }, [scope]);

  // One member can hold shares in several branches (Naser is in both Ummu Gaffa
  // and Ajman), which is several rows but one person to hand cash to.
  // Keyed by display name, not shareholder id: the same person has a separate
  // shareholder row per branch, but you hand them one envelope.
  const byMember = useMemo(() => {
    const m = new Map<string, { member: string; count: number; outstanding: number }>();
    for (const r of scope) {
      if (r.paid) continue;
      const e = m.get(r.member) ?? { member: r.member, count: 0, outstanding: 0 };
      m.set(r.member, { member: r.member, count: e.count + 1, outstanding: e.outstanding + r.amount });
    }
    return [...m.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [scope]);

  const selectableIds = visible.filter((r) => !r.paid).map((r) => r.itemId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function markForwarded() {
    const ids = [...selected].filter((id) => selectableIds.includes(id));
    if (ids.length === 0) return;
    const sum = visible
      .filter((r) => ids.includes(r.itemId))
      .reduce((a, r) => a + r.amount, 0);
    if (!paidOn) { setMsg({ type: 'err', text: 'Pick the date it was paid' }); return; }
    if (!confirm(
      `Mark ${ids.length} payout(s) totalling ${formatMoney(sum)} as handed over on ${formatDate(paidOn)}?`,
    )) return;
    setMsg(null);
    start(async () => {
      const res = await payDistributionItems(ids, { paidOn, remarks: remarks || null });
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setSelected(new Set());
      setRemarks('');
      setMsg({ type: 'ok', text: `Marked ${res.data.paid_count} payout(s), ${formatMoney(res.data.total_amount)}.` });
      router.refresh();
    });
  }

  function undo(row: PayoutRow) {
    if (!confirm(`Undo the handover of ${formatMoney(row.amount)} to ${row.member}? The withdrawal record will be deleted.`)) return;
    setMsg(null);
    start(async () => {
      const res = await unpayDistributionItem(row.itemId);
      if (!res.ok) { setMsg({ type: 'err', text: res.error }); return; }
      setMsg({ type: 'ok', text: 'Handover reversed.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi"><span className="kpi-label">Payable</span><span className="kpi-value">{formatMoney(totals.payable)}</span></div>
        <div className="kpi"><span className="kpi-label">Forwarded</span><span className="kpi-value text-emerald-700">{formatMoney(totals.forwarded)}</span></div>
        <div className="kpi">
          <span className="kpi-label">Remaining to pay</span>
          <span className={`kpi-value ${totals.remaining > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
            {formatMoney(totals.remaining)}
          </span>
        </div>
      </div>

      {byMember.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-sm mb-2">Outstanding by member</h2>
          <div className="flex flex-wrap gap-2">
            {byMember.map((m) => (
              <span
                key={m.member}
                className="inline-flex items-baseline gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm"
              >
                <b>{m.member}</b>
                <span className="tabular-nums text-amber-700">{formatMoney(m.outstanding)}</span>
                {m.count > 1 && (
                  <span className="text-xs text-slate-400">{m.count} payouts</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            My handovers only
            <span className="text-slate-400 font-normal">({currentUserName})</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
            Show already forwarded
          </label>
        </div>

        {selected.size > 0 && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 grid grid-cols-1 sm:grid-cols-[auto_10rem_1fr_auto] gap-3 items-end">
            <div className="text-sm font-medium text-slate-700 sm:pb-2.5">
              {selected.size} selected ·{' '}
              {formatMoney(visible.filter((r) => selected.has(r.itemId)).reduce((a, r) => a + r.amount, 0))}
            </div>
            <div>
              <label className="label">Paid on</label>
              <input
                className="input"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Remarks</label>
              <input
                className="input"
                placeholder="optional — e.g. cash to Naser, bank transfer"
                maxLength={500}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
            <button className="btn-primary" disabled={pending} onClick={markForwarded}>
              {pending ? 'Saving…' : 'Mark forwarded'}
            </button>
          </div>
        )}

        {msg && (
          <div className={`text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
            {msg.text}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableIds.length === 0}
                    aria-label="Select all"
                  />
                </th>
                <th>Member</th>
                <th>Branch</th>
                <th>Month</th>
                <th className="text-right">Amount</th>
                <th>Handed over by</th>
                <th>Status</th>
                <th>Paid on</th>
                <th>Remarks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.itemId}>
                  <td>
                    {!r.paid && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.itemId)}
                        onChange={() => toggle(r.itemId)}
                        aria-label={`Select ${r.member}`}
                      />
                    )}
                  </td>
                  <td className="font-medium">{r.member}</td>
                  <td className="text-slate-500">{r.branch}</td>
                  <td className="whitespace-nowrap">{formatMonth(r.month)}</td>
                  <td className="text-right tabular-nums font-medium">{formatMoney(r.amount)}</td>
                  <td className="text-slate-500">
                    {r.viaName ?? <span className="text-slate-400">direct</span>}
                  </td>
                  <td>
                    {r.paid
                      ? <span className="text-xs text-emerald-700">forwarded</span>
                      : <span className="text-xs text-amber-700">outstanding</span>}
                  </td>
                  <td className="whitespace-nowrap text-slate-500">
                    {r.paidAt ? formatDate(r.paidAt) : '—'}
                  </td>
                  <td className="wrap text-slate-500 text-xs max-w-xs">{r.remarks ?? ''}</td>
                  <td>
                    {r.paid && (
                      <button
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        disabled={pending}
                        onClick={() => undo(r)}
                      >
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-slate-400 py-6 text-center">
                    {mineOnly
                      ? 'Nothing outstanding for you to hand over.'
                      : 'Nothing outstanding — approve a distribution run to create payouts.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
