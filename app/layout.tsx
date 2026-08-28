import './globals.css';
import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { getRole } from '@/lib/auth';

export const metadata: Metadata = { title: 'APC Dashboard', description: 'A Players Club operating dashboard' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { email, role } = await getRole();
  return (
    <html lang="en">
      <body className="min-h-screen bg-base">
        {email && <Nav email={email} role={role} />}
        <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
