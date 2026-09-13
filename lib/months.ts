/** Month strings are "YYYY-MM" throughout. */

export function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is 1-based, so this is the following month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function minMonth(a: string, b: string): string {
  return a < b ? a : b;
}

/**
 * Last calendar month in UAE time. A month's profit is known only once it has
 * ended, so this is the latest month that can be entered.
 */
export function previousMonthDubai(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
