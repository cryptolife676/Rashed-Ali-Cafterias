import { z } from 'zod';

export const TransactionInput = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  kind: z.enum(['income', 'expense']),
  category_id: z.string().uuid().nullable().optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  amount: z.coerce.number().positive().max(1_000_000_000),
  notes: z.string().max(2000).optional().nullable(),
});

export type TransactionInputT = z.infer<typeof TransactionInput>;

export const TransactionUpdate = TransactionInput.partial().extend({
  id: z.string().uuid(),
});
