import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

type CookieItem = { name: string; value: string; options?: Partial<ResponseCookie> };

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url, { status: 303 });
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: CookieItem[]) {
          // Attach Supabase's cookie clears to the redirect response itself
          // so the browser actually drops them.
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.signOut();
  return response;
}
