import { z } from 'zod';
import { MonthInput } from './monthly-profit';

export const DistributionRunInput = z.object({
  // Required as of migration 0007: profit is declared per branch, and a
  // combined run would pool shareholders who own shares in different branches.
  branch_id: z.string().uuid('Select a branch'),
  period_month: MonthInput,
  notes: z.string().max(2000).optional().nullable(),
});

export const AdjustItemInput = z.object({
  item_id: z.string().uuid(),
  manual_adjustment: z.coerce.number().min(-9_999_999).max(9_999_999),
});
