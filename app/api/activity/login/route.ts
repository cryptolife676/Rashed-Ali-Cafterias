import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Use admin client to write to system_activity (RLS allows reads only)
  if (profile && ['super_admin', 'admin'].includes(profile.role)) {
    const sb = createAdminClient();
    const now = new Date().toISOString();
    await sb.from('system_activity').update({ last_admin_login: now, updated_at: now }).eq('id', 1);
    // Also dismiss outstanding inactivity notifications
    await sb
      .from('notifications')
      .update({ read_at: now })
      .is('read_at', null)
      .eq('kind', 'inactivity');
  }
  return NextResponse.json({ ok: true });
}
