'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMonthlyProfit } from '@/server/actions/monthly-profit';

export default function ProfitRowActions({
  profitId,
  label,
  locked,
}: {
  profitId: string;
  label: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (locked) return null;

  function onDelete() {
    if (!confirm(`Delete the declared profit for ${label}?`)) return;
    setErr(null);
    start(async () => {
      const res = await deleteMonthlyProfit(profitId);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        className="text-xs text-red-600 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={onDelete}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
    </div>
  );
}
