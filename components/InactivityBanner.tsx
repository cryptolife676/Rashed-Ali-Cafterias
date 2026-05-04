import { createClient } from '@/lib/supabase/server';

export const revalidate = 60;

export default async function InactivityBanner() {
  const supabase = await createClient();
  const { data: act } = await supabase
    .from('system_activity')
    .select('last_admin_login, last_keep_alive')
    .eq('id', 1)
    .single();

  if (!act?.last_admin_login) return null;
  const days = Math.floor(
    (Date.now() - new Date(act.last_admin_login).getTime()) / 86_400_000,
  );
  const warn = Number(process.env.INACTIVITY_WARN_DAYS ?? 5);
  if (days < warn) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm">
      <b>System inactive for {days} days.</b> Supabase free tier pauses after 7 days.
      Post a transaction or just stay signed in to keep it active.
    </div>
  );
}
