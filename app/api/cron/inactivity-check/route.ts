import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WARN = Number(process.env.INACTIVITY_WARN_DAYS ?? 5);
const ALERT = Number(process.env.INACTIVITY_ALERT_DAYS ?? 6);

async function sendEmail(subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!key || !to || !from) return { sent: false, reason: 'email not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return { sent: res.ok, status: res.status };
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data: act } = await sb
    .from('system_activity')
    .select('last_admin_login, last_write')
    .eq('id', 1)
    .single();

  const now = Date.now();
  const lastLogin = act?.last_admin_login ? new Date(act.last_admin_login).getTime() : 0;
  const daysSinceLogin = lastLogin === 0 ? 9999 : Math.floor((now - lastLogin) / 86_400_000);

  let action: 'none' | 'warn' | 'alert' = 'none';
  if (daysSinceLogin >= ALERT) action = 'alert';
  else if (daysSinceLogin >= WARN) action = 'warn';

  if (action !== 'none') {
    // Broadcast notification (user_id null = broadcast to admins)
    await sb.from('notifications').insert({
      user_id: null,
      kind: 'inactivity',
      title: action === 'alert'
        ? `System inactive ${daysSinceLogin} days — please log in`
        : `Reminder: ${daysSinceLogin} days since last admin login`,
      body: 'Supabase free tier pauses after 7 days of inactivity. Log in or post a transaction to keep the project active.',
      payload: { days: daysSinceLogin, threshold: action === 'alert' ? ALERT : WARN },
    });

    if (action === 'alert') {
      await sendEmail(
        `[Cafeteria] Inactivity alert — ${daysSinceLogin} days`,
        `<p>The admin has not logged in for <b>${daysSinceLogin} days</b>.</p>
         <p>Supabase free tier pauses projects after 7 days of inactivity.</p>
         <p>Please <a href="https://rashed-ali-cafterias.vercel.app/login">log in</a> to keep the system active.</p>`,
      );
    }
  }

  return NextResponse.json({ ok: true, days_since_login: daysSinceLogin, action });
}

export const POST = GET;
