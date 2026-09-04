import { createClient } from '@/lib/supabase/server';

export const revalidate = 60;

export default async function InactivityBanner() {
  const supabase = await createClient();
  const { data: act } = await supabase
    .from('system_activity')
    .select('last_admin_login, last_keep_alive, last_write')
    .eq('id', 1)
    .single();

  // True inactivity = time since the most recent of ANY activity:
  // an admin login, an automated keep-alive ping, or any data write.
  const stamps = [act?.last_admin_login, act?.last_keep_alive, act?.last_write]
    .filter(Boolean)
    .map((t) => new Date(t as string).getTime());
  if (stamps.length === 0) return null;

  const days = Math.floor((Date.now() - Math.max(...stamps)) / 86_400_000);
  const warn = Number(process.env.INACTIVITY_WARN_DAYS ?? 5);
  if (days < warn) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm">
      <b>No database activity for {days} days.</b> Supabase free tier pauses after 7 days.
      Check that the keep-alive pinger (uptime monitor on <code>/api/time</code>) is running.
    </div>
  );
}
