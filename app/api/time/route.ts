import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public live time/date endpoint that doubles as a keep-alive.
 *
 * Every hit makes a real Supabase request (a read, plus a throttled write),
 * which registers activity and stops the free-tier project from pausing after
 * 7 idle days. Point a free uptime monitor (UptimeRobot, cron-job.org, …) at
 *   https://<your-domain>/api/time
 * on any schedule (every few hours is plenty) and the site never sleeps.
 *
 * No auth: it returns only the server time and a keep-alive flag, and the DB
 * write is throttled so frequent pings can't fill the log table.
 */

const WRITE_INTERVAL_MS = 6 * 60 * 60 * 1000; // write at most once every 6h
const TZ = 'Asia/Dubai';

export async function GET() {
  const now = new Date();
  const iso = now.toISOString();
  let keptAlive = false;
  let db: 'ok' | 'error' = 'ok';

  try {
    const supabase = createAdminClient();

    // READ on every hit — this alone counts as Supabase activity.
    const { data: act, error } = await supabase
      .from('system_activity')
      .select('last_keep_alive')
      .eq('id', 1)
      .single();
    if (error) throw error;

    const last = act?.last_keep_alive ? new Date(act.last_keep_alive).getTime() : 0;
    if (now.getTime() - last > WRITE_INTERVAL_MS) {
      // Throttled WRITE so the admin inactivity banner stays fresh without
      // flooding keep_alive_logs under frequent pings.
      await supabase.from('keep_alive_logs').insert({ source: 'uptime-ping' });
      await supabase
        .from('system_activity')
        .update({ last_keep_alive: iso, updated_at: iso })
        .eq('id', 1);
      keptAlive = true;
    }
  } catch {
    db = 'error';
  }

  return NextResponse.json(
    {
      ok: true,
      db,
      keptAlive,
      timezone: TZ,
      utc: iso,
      unix: Math.floor(now.getTime() / 1000),
      date: now.toLocaleDateString('en-GB', {
        timeZone: TZ,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: now.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// Uptime monitors may issue HEAD/POST too.
export const POST = GET;
export const HEAD = GET;
