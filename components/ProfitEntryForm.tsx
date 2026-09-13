'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertMonthlyProfit } from '@/server/actions/monthly-profit';
import { allocateLargestRemainder } from '@/lib/accounting/allocate';
import { formatMoney, formatMonth } from '@/lib/utils';
import { minMonth, nextMonth } from '@/lib/months';

export type TeamMember = {
  branch_id: string;
  shareholder_id: string;
  display_name: string;
  ownership_pct: number;
};

export type DeclaredMonth = {
  branch_id: string;
  period_month: string; // YYYY-MM-01
  declared_amount: number;
  is_locked: boolean;
};

type Branch = { id: string; name: string };

/**
 * Enter one month's amount owed to the team.
 *
 * Dashboard: one per cafeteria, branch fixed, compact. Monthly Profit page:
 * with a branch picker. The split preview uses the same allocator as the
 * server, so what Shabeer sees is what gets distributed.
 */
export default function ProfitEntryForm({
  branches,
  fixedBranchId,
  team,
  declared,
  defaultMonth,
  maxMonth,
  compact = false,
}: {
  branches: Branch[];
  fixedBranchId?: string;
  team: TeamMember[];
  declared: DeclaredMonth[];
  defaultMonth: string; // YYYY-MM
  maxMonth: string; // YYYY-MM — last month; a month is known only once it ends
  compact?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(fixedBranchId ?? '');
  const [month, setMonth] = useState(defaultMonth);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [showNote, setShowNote] = useState(!compact);

  const members = useMemo(() => team.filter((m) => m.branch_id === branchId), [team, branchId]);
  const noMembers = Boolean(branchId) && members.length === 0;
  const existing = declared.find((d) => d.branch_id === branchId && d.period_month.slice(0, 7) === month);
  const locked = Boolean(existing?.is_locked);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? '';

  const preview = useMemo(() => {
    const total = Number(amount);
    if (!branchId || !Number.isFinite(total) || total <= 0 || members.length === 0) return null;
    const weights = members.map((m) => Number(m.ownership_pct));
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    const amounts = allocateLargestRemainder(total, weights);
    return members.map((m, i) => ({
      name: m.display_name,
      share: (Number(m.ownership_pct) / weightTotal) * 100,
      amount: amounts[i],
    }));
  }, [amount, branchId, members]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const savedMonth = month;
    const savedAmount = Number(amount);
    start(async () => {
      const res = await upsertMonthlyProfit({
        branch_id: branchId,
        period_month: month,
        declared_amount: amount,
        notes: notes || null,
      });
      if (!res.ok) { setErr(res.error); return; }
      setOk(`Saved ${formatMonth(savedMonth)} · ${formatMoney(savedAmount)}`);
      setAmount('');
      setNotes('');
      if (fixedBranchId) {
        // Move on to the following month so a backlog can be entered in a row.
        setMonth(minMonth(nextMonth(savedMonth), maxMonth));
      } else {
        setBranchId('');
      }
      router.refresh();
    });
  }

  const ids = {
    branch: `${uid}-branch`,
    month: `${uid}-month`,
    amount: `${uid}-amount`,
    notes: `${uid}-notes`,
  };

  return (
    <form
      onSubmit={onSubmit}
      className={compact ? 'space-y-3' : 'card space-y-3'}
      aria-label={branchName ? `Enter monthly profit for ${branchName}` : 'Enter monthly profit'}
    >
      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
        {!fixedBranchId && (
          <div>
            <label className="label" htmlFor={ids.branch}>Branch</label>
            <select
              id={ids.branch}
              className="input"
              required
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="" disabled>Select a branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor={ids.month}>Month</label>
          <input
            id={ids.month}
            className="input"
            type="month"
            required
            max={maxMonth}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div>
          {/* Short on the dashboard cards: the long label wrapped to two lines in
              the three-column layout and pushed this box below the month box. */}
          <label className="label" htmlFor={ids.amount}>{compact ? 'Amount' : 'Amount for the team'}</label>
          <input
            id={ids.amount}
            className="input"
            type="number"
            inputMode="decimal"
            step="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={locked || noMembers}
          />
        </div>
      </div>

      {existing && !locked && (
        <p className="text-xs text-amber-700">
          {formatMonth(month)} already has {formatMoney(existing.declared_amount)}. Saving replaces it.
        </p>
      )}
      {locked && existing && (
        <p className="text-xs text-slate-500">
          {formatMonth(month)} is already distributed ({formatMoney(existing.declared_amount)}) and
          can&apos;t be changed.
        </p>
      )}
      {noMembers && (
        <p className="text-sm text-red-600">
          No team members in this branch yet, so there is nobody to divide the amount between.
        </p>
      )}

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Splits as
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.map((p) => (
              <span
                key={p.name}
                className="inline-flex items-baseline gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-sm"
              >
                <b>{p.name}</b>
                <span className="tabular-nums">{formatMoney(p.amount)}</span>
                <span className="text-xs text-slate-400">{p.share.toFixed(2)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {showNote ? (
        <div>
          <label className="label" htmlFor={ids.notes}>Notes</label>
          <input
            id={ids.notes}
            className="input"
            placeholder="optional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      ) : (
        <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setShowNote(true)}>
          + Add note
        </button>
      )}

      <button
        className="btn-primary w-full"
        disabled={pending || noMembers || locked || !branchId || !amount}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>

      {!compact && (
        <p className="text-xs text-slate-500">
          Enter what the team is owed for the month — not the branch&apos;s total profit. It is
          divided between the members by their shares. Re-saving the same branch and month replaces
          the earlier figure, unless it has already been distributed.
        </p>
      )}
      {err && <div className="text-sm text-red-600" role="alert">{err}</div>}
      {ok && <div className="text-sm text-emerald-700" role="status">{ok}</div>}
    </form>
  );
}
