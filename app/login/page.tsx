'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink() {
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">APC Dashboard</h1>
      <p className="mt-2 text-sm text-muted">Sign in with your work email. We'll send a one-time link.</p>

      {sent ? (
        <p className="mt-8 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
          Link sent to {email}. Open it on this device.
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && email && sendLink()}
            placeholder="you@theaplayersclub.com"
            className="w-full rounded-md border border-edge bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            onClick={sendLink}
            disabled={!email || busy}
            className="w-full rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send link'}
          </button>
          {error && <p className="text-xs text-bad">{error}</p>}
        </div>
      )}
    </div>
  );
}
