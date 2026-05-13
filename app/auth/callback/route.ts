import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function safeNext(raw: string | null): string {
  if (!raw) return '/admin/dashboard';
  // Must be a same-origin relative path. Reject anything that could escape:
  // protocol-relative ("//evil.com"), backslash variant ("/\\evil.com"),
  // schemes ("javascript:..."), or non-leading-slash inputs.
  if (
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith('/\\') ||
    raw.includes('\0')
  ) {
    return '/admin/dashboard';
  }
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
