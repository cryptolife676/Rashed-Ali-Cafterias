import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieItem = { name: string; value: string; options?: Record<string, unknown> };

/** Server client bound to the user's session via cookies. Respects RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: CookieItem[]) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any),
            );
          } catch {
            // Called from a Server Component — middleware refreshes cookies instead.
          }
        },
      },
    },
  );
}
