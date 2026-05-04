import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 1) Insert a keep-alive log row (a real WRITE, not just a read)
  const { error: insErr } = await supabase
    .from('keep_alive_logs')
    .insert({ source: 'cron', payload: { ua: req.headers.get('user-agent') ?? null } });
  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  // 2) Update the singleton system_activity row
  const { error: actErr } = await supabase
    .from('system_activity')
    .update({ last_keep_alive: now, updated_at: now })
    .eq('id', 1);
  if (actErr) {
    return NextResponse.json({ ok: false, error: actErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pinged_at: now });
}

// Allow POST too (Vercel cron can issue either)
export const POST = GET;
