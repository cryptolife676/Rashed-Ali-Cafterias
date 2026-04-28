'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/guards';
import {
  TransactionInput,
  TransactionUpdate,
} from '@/lib/validators/transaction';

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireStaff();
  const parsed = TransactionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...parsed.data, recorded_by: user.id })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/dashboard');
  return { ok: true, data: { id: data.id } };
}

export async function updateTransaction(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = TransactionUpdate.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...rest } = parsed.data;

  const supabase = await createClient();

  // Block edits to locked rows (those rolled into approved distributions)
  const { data: existing } = await supabase
    .from('transactions')
    .select('is_locked')
    .eq('id', id)
    .single();
  if (!existing) return { ok: false, error: 'Transaction not found' };
  if (existing.is_locked) {
    return { ok: false, error: 'Transaction is locked (included in an approved distribution).' };
  }

  const { error } = await supabase.from('transactions').update(rest).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/transactions');
  return { ok: true, data: null };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('transactions')
    .select('is_locked')
    .eq('id', id)
    .single();
  if (!existing) return { ok: false, error: 'Transaction not found' };
  if (existing.is_locked) {
    return { ok: false, error: 'Cannot delete a locked transaction.' };
  }

  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/transactions');
  return { ok: true, data: null };
}
