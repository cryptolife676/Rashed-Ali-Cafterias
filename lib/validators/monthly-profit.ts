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

export const MonthlyProfitInput = z.object({
  branch_id: z.string().uuid('Select a branch'),
  period_month: MonthInput,
  /**
   * What the payout group is collectively owed for this branch and month —
   * NOT the branch's profit. Zero and negative are allowed so a bad month is
   * still on record; the distribution engine is what refuses to distribute a
   * non-positive amount.
   */
  declared_amount: z.coerce
    .number()
    .finite('Enter a number')
    .min(-1_000_000_000)
    .max(1_000_000_000),
  notes: z.string().max(2000).optional().nullable(),
});

export type MonthlyProfitInputT = z.infer<typeof MonthlyProfitInput>;

export const MonthlyProfitUpdate = z.object({
  id: z.string().uuid(),
  declared_amount: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000),
  notes: z.string().max(2000).optional().nullable(),
});
