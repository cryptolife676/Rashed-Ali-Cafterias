import { z } from 'zod';

/**
 * `<input type="month">` submits "YYYY-MM". Everything downstream stores a
 * date, and monthly_profits has a check constraint pinning it to the first
 * of the month, so normalize here at the boundary.
 */
export const MonthInput = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month')
  .transform((v) => `${v}-01`);

/**
 * Informational money fields: an untouched number input submits '', which
 * z.coerce.number() would silently turn into 0 — a real declared zero and
 * "not reported" are different facts, so map blanks to null.
 */
const optionalMoney = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce
    .number()
    .min(0, 'Cannot be negative')
    .max(1_000_000_000)
    .nullable(),
);

export const MonthlyProfitInput = z.object({
  branch_id: z.string().uuid('Select a branch'),
  period_month: MonthInput,
  // Zero and negative are valid: a loss month is still worth declaring.
  // The distribution engine is what refuses to distribute a non-positive month.
  net_profit: z.coerce
    .number()
    .finite('Enter a number')
    .min(-1_000_000_000)
    .max(1_000_000_000),
  gross_income: optionalMoney,
  total_expenses: optionalMoney,
  notes: z.string().max(2000).optional().nullable(),
});

export type MonthlyProfitInputT = z.infer<typeof MonthlyProfitInput>;

export const MonthlyProfitUpdate = z.object({
  id: z.string().uuid(),
  net_profit: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000),
  gross_income: optionalMoney,
  total_expenses: optionalMoney,
  notes: z.string().max(2000).optional().nullable(),
});
