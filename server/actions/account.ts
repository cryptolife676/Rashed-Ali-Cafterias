'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser, requireSuperAdmin } from '@/lib/auth/guards';
import {
  ChangeOwnPasswordInput,
  SetUserPasswordInput,
} from '@/lib/validators/account';
import type { ActionResult } from './types';

/**
 * Does this account already sign in with a password?
 *
 * Google-only accounts have no password to verify, so they set one rather
 * than change one. `providers` lives in app_metadata and is readable only
 * through the admin API.
 */
async function hasPasswordIdentity(userId: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data } = await sb.auth.admin.getUserById(userId);
  const providers = (data?.user?.app_metadata?.providers ?? []) as string[];
  return providers.includes('email');
}

export async function accountHasPassword(): Promise<boolean> {
  const user = await requireUser();
  return hasPasswordIdentity(user.id);
}

/**
 * Change your own password.
 *
 * Re-authenticates with the current password first. Without that, anyone
 * who reaches an unlocked browser could take the account over and lock the
 * real owner out — a live session is not proof of identity.
 *
 * Verification runs on a throwaway client with persistSession off, so a
 * wrong guess cannot disturb the caller's real session cookies.
 */
export async function changeOwnPassword(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ChangeOwnPasswordInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { current_password, new_password } = parsed.data;

  const needsCurrent = await hasPasswordIdentity(user.id);

  if (needsCurrent) {
    if (!current_password) {
      return { ok: false, error: 'Enter your current password' };
    }
    if (!user.email) {
      return { ok: false, error: 'This account has no email address to verify against.' };
    }
    const verifier = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: vErr } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: current_password,
    });
    if (vErr) return { ok: false, error: 'Current password is incorrect' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) return { ok: false, error: error.message };

  // Record that it happened. The password itself is never written anywhere.
  const sb = createAdminClient();
  const { error: auditErr } = await sb.from('audit_logs').insert({
    actor_id: user.id,
    action: 'CUSTOM',
    table_name: 'auth.users',
    row_id: user.id,
    after: { op: needsCurrent ? 'password_changed' : 'password_set', self: true },
  });

  revalidatePath('/account');
  if (auditErr) {
    // The password really did change — say so rather than reporting a
    // failure the user would retry, but don't hide the missing audit entry.
    return {
      ok: false,
      error: `Your password was changed, but the audit entry could not be written (${auditErr.message}). Tell the administrator.`,
    };
  }
  return { ok: true, data: null };
}

/**
 * Set another user's password. Owner account only.
 *
 * This is impersonation-capable — whoever sets the password can sign in as
 * that person — so it is restricted to super_admin and always audited.
 */
export async function setUserPassword(input: unknown): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = SetUserPasswordInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { user_id, new_password } = parsed.data;

  const sb = createAdminClient();

  const { data: target, error: tErr } = await sb.auth.admin.getUserById(user_id);
  if (tErr || !target?.user) return { ok: false, error: 'User not found' };

  const { error } = await sb.auth.admin.updateUserById(user_id, {
    password: new_password,
  });
  if (error) return { ok: false, error: error.message };

  const { error: auditErr } = await sb.from('audit_logs').insert({
    actor_id: actor.id,
    action: 'CUSTOM',
    table_name: 'auth.users',
    row_id: user_id,
    after: {
      op: 'password_set_by_admin',
      target_email: target.user.email ?? null,
    },
  });

  revalidatePath('/admin/users');
  if (auditErr) {
    // The audit entry is the safeguard this page promises, so a silent
    // failure is not acceptable: the password did change, and that has to
    // be stated plainly even though the trail is missing.
    return {
      ok: false,
      error: `The password WAS changed, but the audit entry could not be written (${auditErr.message}). Record this manually.`,
    };
  }
  return { ok: true, data: null };
}
