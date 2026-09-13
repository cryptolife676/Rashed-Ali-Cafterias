import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/auth/guards';
import ResetPasswordForm, { type ManagedUser } from './ResetPasswordForm';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  // Setting someone else's password makes impersonation possible, so this
  // page is owner-only rather than admin-wide.
  const me = await requireSuperAdmin();
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .order('role')
    .order('full_name');

  // Email addresses live in auth.users, not profiles, so they need the
  // admin API. This is the only place the app reads them.
  const sb = createAdminClient();
  const { data: authList } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const emailById = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );

  const users: ManagedUser[] = (profiles ?? []).map((p) => ({
    id: p.id as string,
    full_name: p.full_name as string,
    email: emailById.get(p.id as string) ?? null,
    role: p.role as string,
    is_active: p.is_active as boolean,
    is_self: p.id === me.id,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-slate-500 mt-1">
          Set a new password for someone who has been locked out. Everyone can
          change their own password from their account page.
        </p>
      </div>

      <div className="card border-l-4 border-amber-400 text-sm text-slate-600">
        Setting someone&apos;s password lets you sign in as them, so every change here
        is written to the audit log with your name against it. The password itself is
        never stored or logged. Send it to the person through a channel you trust, and
        ask them to change it once they are back in.
      </div>

      <ResetPasswordForm users={users} />
    </div>
  );
}
