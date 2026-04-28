import { z } from 'zod';

export const DistributionRunInput = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional().nullable(),
}).refine((v) => v.period_end >= v.period_start, {
  message: 'period_end must be on or after period_start',
  path: ['period_end'],
});

export const AdjustItemInput = z.object({
  item_id: z.string().uuid(),
  manual_adjustment: z.coerce.number(),
});
