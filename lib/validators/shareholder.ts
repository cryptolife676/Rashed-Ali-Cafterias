import { z } from 'zod';

const ownershipPct = z.coerce.number().positive().max(100).refine(
  (v) => Math.abs(Math.round(v * 10000) / 10000 - v) < 1e-9,
  'ownership_pct supports at most 4 decimal places',
);

export const ShareholderInput = z.object({
  profile_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  display_name: z.string().min(1).max(200),
  ownership_pct: ownershipPct,
  is_active: z.boolean().default(true),
  joined_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ShareholderUpdate = ShareholderInput.partial().extend({
  id: z.string().uuid(),
});

// Note: investments table has no branch_id column — don't accept it from the form.
export const InvestmentInput = z.object({
  shareholder_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  invested_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional().nullable(),
});

export const WithdrawalInput = z.object({
  shareholder_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  withdrawn_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional().nullable(),
});
