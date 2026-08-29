import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Collect the cookies Supabase wants to set, then apply them to whichever
  // response we return. This avoids depending on the request cookie store
  // being writable.
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => {
          const header = request.headers.get('cookie') ?? '';
          return header
            .split(';')
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const i = c.indexOf('=');
              return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
            });
        },
        setAll: (list: CookieToSet[]) => { pending.push(...list); },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
