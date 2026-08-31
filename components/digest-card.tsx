'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Panel, Empty } from '@/components/ui';
import { eur } from '@/lib/format';

export type DigestItem = {
  priority: 1 | 2 | 3;
  category: string;
  message: string;
  value_eur: number | null;
  contact_name: string | null;
  action: string;
};

export type Digest = {
  id: string;
  generated_at: string;
  summary: string | null;
  items: DigestItem[];
};

const TONE = {
  1: { dot: 'bg-bad', text: 'text-bad', label: 'Act today' },
  2: { dot: 'bg-warn', text: 'text-warn', label: 'This week' },
  3: { dot: 'bg-muted', text: 'text-muted', label: 'FYI' },
} as const;

/** How stale is this digest? Anything past a day is worth flagging. */
function freshness(generatedAt: string) {
  const hours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  if (hours < 1) return { label: 'just now', stale: false };
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, stale: false };
  return { label: `${Math.floor(hours / 24)}d ago`, stale: true };
}

export function DigestCard({ digest }: { digest: Digest | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-daily-digest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error(`Regeneration failed (${res.status})`);
      // Server component holds the data, so a reload is the simplest refresh.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regeneration failed');
      setBusy(false);
    }
  }

  if (!digest) {
    return (
      <Panel title="Daily digest">
        <Empty>No digest generated yet.</Empty>
        <div className="mt-3 flex justify-center">
          <button
            onClick={regenerate}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Generate now'}
          </button>
        </div>
      </Panel>
    );
  }

  const items = [...digest.items].sort((a, b) => a.priority - b.priority);
  const p1 = items.filter((i) => i.priority === 1);
  const rest = items.filter((i) => i.priority !== 1);
  const visible = showAll ? items : [...p1, ...rest.slice(0, 5)];
  const hidden = items.length - visible.length;

  const fresh = freshness(digest.generated_at);

  return (
    <section className="rounded-lg border border-edge bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-edge px-5 py-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {digest.summary ?? 'Daily digest'}
          </h2>
          <p className={clsx('mt-1 text-xs', fresh.stale ? 'text-warn' : 'text-muted')}>
            Generated {fresh.label}
            {fresh.stale && ' — this is out of date'}
            {' · '}
            {new Date(digest.generated_at).toLocaleString('en-IE', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <button
          onClick={regenerate}
          disabled={busy}
          className="rounded-md border border-edge px-2.5 py-1.5 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {busy ? 'Regenerating…' : 'Regenerate'}
        </button>
      </header>

      <div className="p-5">
        {error && <p className="mb-3 text-xs text-bad">{error}</p>}

        {items.length === 0 ? (
          <Empty>Nothing flagged. Enjoy it.</Empty>
        ) : (
          <>
            <ul className="space-y-2">
              {visible.map((item, i) => {
                const tone = TONE[item.priority] ?? TONE[3];
                return (
                  <li
                    key={`${item.category}-${i}`}
                    className="flex items-start gap-3 border-b border-edge pb-2 last:border-0"
                  >
                    <span
                      className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {item.contact_name && (
                          <span className="font-medium">{item.contact_name} — </span>
                        )}
                        <span className={item.priority === 3 ? 'text-muted' : undefined}>
                          {item.message}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className={tone.text}>{tone.label}</span>
                        {' · '}
                        {item.action}
                      </p>
                    </div>
                    {item.value_eur != null && (
                      <span className="tnum shrink-0 text-sm">{eur(item.value_eur)}</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {hidden > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-3 text-xs text-accent hover:underline"
              >
                Show {hidden} more
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
