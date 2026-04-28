import { z } from 'zod';

export const ShareholderInput = z.object({
  profile_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  display_name: z.string().min(1).max(200),
  ownership_pct: z.coerce.number().positive().max(100),
  is_active: z.boolean().default(true),
  joined_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ShareholderUpdate = ShareholderInput.partial().extend({
  id: z.string().uuid(),
});

export const InvestmentInput = z.object({
  shareholder_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  invested_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
});

export const WithdrawalInput = z.object({
  shareholder_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  withdrawn_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional().nullable(),
});
