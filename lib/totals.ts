/**
 * Totals for the money lists shown at the foot of each table.
 */

type Money = number | string | null | undefined;

export function sumBy<T>(rows: T[], pick: (row: T) => Money): number {
  return rows.reduce((acc, row) => acc + Number(pick(row) ?? 0), 0);
}

type DistributionItem = {
  computed_amount: Money;
  manual_adjustment: Money;
  final_amount: Money;
  paid_at: string | null;
  // PostgREST returns a many-to-one embed as an object, but the typed client
  // sometimes infers an array; accept both rather than trust either.
  run?: { status?: string } | { status?: string }[] | null;
};

/**
 * Only approved and paid runs count. A draft can still change, and a void run
 * was cancelled — adding either would show money that was never owed, like the
 * voided Mar 2026 draft that still appears in some members' lists.
 */
export function distributionTotals(items: DistributionItem[]) {
  const statusOf = (it: DistributionItem) =>
    (Array.isArray(it.run) ? it.run[0]?.status : it.run?.status) ?? '';
  const counted = items.filter((it) => ['approved', 'paid'].includes(statusOf(it)));
  const final = sumBy(counted, (it) => it.final_amount);
  const paid = sumBy(counted.filter((it) => it.paid_at), (it) => it.final_amount);
  return {
    computed: sumBy(counted, (it) => it.computed_amount),
    adjustment: sumBy(counted, (it) => it.manual_adjustment),
    final,
    paid,
    owed: final - paid,
    excluded: items.length - counted.length,
  };
}
