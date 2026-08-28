'use client';

import { useState } from 'react';

const OPTIONS = ['not contacted', 'contacted', 'negotiating', 'won', 'lost'] as const;

export function PipelineStatus({ termId, personId, initial, disabled }: {
  termId: string; personId: string; initial: string; disabled: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function update(next: string) {
    const previous = value;
    setValue(next); setSaving(true); setFailed(false);
    const res = await fetch('/api/renewal-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term_id: termId, person_id: personId, status: next }),
    });
    setSaving(false);
    if (!res.ok) { setValue(previous); setFailed(true); }
  }

  return (
    <span className="flex items-center gap-1.5">
      <select
        value={value}
        disabled={disabled || saving}
        onChange={(e) => update(e.target.value)}
        className="rounded border border-edge bg-base px-1.5 py-1 text-xs outline-none focus:border-accent disabled:opacity-50"
      >
        {OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {failed && <span className="text-xs text-bad">Not saved</span>}
    </span>
  );
}
