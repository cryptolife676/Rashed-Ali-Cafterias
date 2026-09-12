/**
 * Shared result shape for every server action.
 *
 * Lived in `transactions.ts` until the daily ledger was retired in
 * migration 0007; moved here so no action file has to import from another.
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
