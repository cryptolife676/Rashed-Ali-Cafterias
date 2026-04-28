import 'server-only';

/**
 * Round to 2 decimals using bankers' rounding-style truncation (HALF_EVEN avoided
 * for simplicity; standard half-up is fine for currency in most jurisdictions).
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Allocate `total` across `weights` (which need not sum to exactly 1).
 * Uses largest-remainder so the sum of allocations equals `total` to the cent.
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
