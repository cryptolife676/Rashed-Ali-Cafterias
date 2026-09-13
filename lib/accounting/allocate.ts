/**
 * Pure allocation maths. Deliberately NOT 'server-only': the Monthly Profit
 * form previews the same split in the browser that the distribution engine
 * will compute on the server, and both must agree to the fill.
 */

/** Round to 2 decimals (currency). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Allocate `total` across `weights` (which need not sum to 1 or to 100).
 * Uses largest-remainder so the sum of allocations equals `total` exactly.
 *
 * Because it normalises by the sum of the weights, passing a group's raw
 * branch percentages yields each member's share OF THE GROUP — e.g. Ummu
 * Gaffa's 2.8966 and 1.8104 allocate as 61.5381% / 38.4619%.
 *
 * Returns amounts in the same order as input weights.
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || weights.length === 0) return weights.map(() => 0);

  const cents = Math.round(total * 100);
  const raw = weights.map((w) => (cents * w) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let remaining = cents - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  const out = floors.slice();
  for (const { i } of order) {
    if (remaining <= 0) break;
    out[i] += 1;
    remaining -= 1;
  }
  return out.map((c) => c / 100);
}
