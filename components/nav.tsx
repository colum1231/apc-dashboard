'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Command centre' },
  { href: '/members', label: 'Members' },
  { href: '/marketing', label: 'Marketing' },
  { href: '/renewals', label: 'Renewals' },
  { href: '/attribution', label: 'Attribution' },
  { href: '/finance', label: 'Finance' },
];

export function Nav({ email, role }: { email: string | null; role: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-base/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">APC</span>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  'whitespace-nowrap rounded px-2.5 py-1.5 text-sm transition-colors',
                  active ? 'bg-accent/10 text-accent' : 'text-muted hover:text-white'
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          {email && <span className="hidden sm:inline">{email}</span>}
          {role && <span className="rounded border border-edge px-1.5 py-0.5">{role}</span>}
          <button onClick={signOut} className="rounded border border-edge px-2 py-1 hover:text-white">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
