'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveDistributionRun,
  payDistributionRun,
  voidDistributionRun,
} from '@/server/actions/distributions';

export default function RunActions({
  runId,
  status,
  role,
}: {
  runId: string;
  status: string;
  role: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const isAdmin = ['super_admin', 'admin'].includes(role);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) { setErr(res.error ?? 'Action failed'); return; }
      router.refresh();
    });
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        {status === 'draft' && (
          <>
            <button className="btn-primary" disabled={pending}
              onClick={() => run(() => approveDistributionRun(runId), 'Approve and lock period transactions?')}>
              Approve
            </button>
            <button className="btn-secondary" disabled={pending}
              onClick={() => run(() => voidDistributionRun(runId), 'Void this draft?')}>
              Void
            </button>
          </>
        )}
        {status === 'approved' && (
          <>
            <button className="btn-primary" disabled={pending}
              onClick={() => run(() => payDistributionRun(runId), 'Mark as paid and create withdrawal records?')}>
              Pay out
            </button>
            <button className="btn-secondary" disabled={pending}
              onClick={() => run(() => voidDistributionRun(runId), 'Void this run?')}>
              Void
            </button>
          </>
        )}
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  );
}
