'use client';

import { useState } from 'react';

export function FlagButton({ personId }: { personId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function flag() {
    setState('busy');
    const note = window.prompt('Note for James (optional)') ?? '';
    const res = await fetch('/api/renewal-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: personId, note }),
    });
    setState(res.ok ? 'done' : 'error');
  }

  const label = { idle: 'Flag', busy: 'Flagging…', done: 'Flagged', error: 'Retry' }[state];

  return (
    <button
      onClick={flag}
      disabled={state === 'busy' || state === 'done'}
      className="rounded border border-edge px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
