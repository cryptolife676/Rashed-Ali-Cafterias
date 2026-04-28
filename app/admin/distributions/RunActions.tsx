'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveDistributionRun,
  payDistributionRun,
  voidDistributionRun,
} from '@/server/actions/distributions';

export default function RunActions({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    start(async () => {
      const res = await fn();
      if (!res.ok) { alert(res.error ?? 'Failed'); return; }
      router.refresh();
    });
  }

  return (
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
  );
}
