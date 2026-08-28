'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge, UnverifiedName, Empty } from '@/components/ui';
import { eur, shortDate, displayName, nameUnverified } from '@/lib/format';
import type { MemberRow } from '@/components/members-table';

export function MemberDrawer({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const [txns, setTxns] = useState<any[] | null>(null);
  const [terms, setTerms] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [t, m, n] = await Promise.all([
        supabase.from('transactions')
          .select('id, transaction_date, amount_eur, category, subcategory, utm_source, utm_medium, utm_campaign, sales_rep')
          .eq('person_id', member.person_id).order('transaction_date', { ascending: false }),
        supabase.from('membership_terms')
          .select('id, tier, term_months, term_start, term_end, extended_to, amount_eur, status')
          .eq('person_id', member.person_id).order('term_start', { ascending: false }),
        supabase.from('member_notes')
          .select('id, note, created_by, created_at')
          .eq('person_id', member.person_id).order('created_at', { ascending: false }),
      ]);
      setTxns(t.data ?? []); setTerms(m.data ?? []); setNotes(n.data ?? []);
    })();
  }, [member.person_id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  async function saveNote() {
    if (!draft.trim()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('member_notes')
      .insert({ person_id: member.person_id, note: draft.trim(), created_by: user?.email ?? null })
      .select().single();
    if (!error && data) { setNotes([data, ...notes]); setDraft(''); }
  }

  const unverified = nameUnverified(member.name_source, member.full_name);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()}
             className="h-full w-full max-w-xl overflow-y-auto border-l border-edge bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              {unverified && <UnverifiedName />}
              {displayName(member.full_name, member.email)}
            </h2>
            <p className="mt-1 text-sm text-muted">{member.email}</p>
            <p className="mt-2 text-xs text-muted">
              name_source: <span className="font-mono">{member.name_source ?? 'null'}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded border border-edge px-2 py-1 text-xs text-muted hover:text-white">Close</button>
        </div>

        <Section title="Terms">
          {!terms ? <Empty>Loading…</Empty> : terms.length === 0 ? <Empty>No terms recorded.</Empty> : (
            <ul className="space-y-2">
              {terms.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded border border-edge px-3 py-2 text-sm">
                  <span>{t.tier ?? '—'} · {t.term_months}m</span>
                  <span className="text-muted">{shortDate(t.term_start)} → {shortDate(t.extended_to ?? t.term_end)}</span>
                  <span className="tnum">{eur(t.amount_eur)}</span>
                  <Badge tone={t.status === 'active' ? 'good' : t.status === 'deposit' ? 'warn' : 'muted'}>{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Payments">
          {!txns ? <Empty>Loading…</Empty> : txns.length === 0 ? <Empty>No payments recorded.</Empty> : (
            <ul className="space-y-1.5">
              {txns.map((t) => (
                <li key={t.id} className="flex items-center justify-between border-b border-edge py-1.5 text-sm">
                  <span className="text-muted">{shortDate(t.transaction_date)}</span>
                  <span className="flex-1 px-3 truncate text-muted">{t.subcategory ?? t.category ?? '—'}</span>
                  <span className="tnum">{eur(t.amount_eur)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Attribution">
          {!txns?.length ? <Empty>No attribution data.</Empty> : (
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">utm_source</dt><dd>{txns[0].utm_source ?? '—'}</dd>
              <dt className="text-muted">utm_medium</dt><dd>{txns[0].utm_medium ?? '—'}</dd>
              <dt className="text-muted">utm_campaign</dt><dd>{txns[0].utm_campaign ?? '—'}</dd>
              <dt className="text-muted">sales_rep</dt><dd>{txns[0].sales_rep ?? '—'}</dd>
            </dl>
          )}
        </Section>

        <Section title="Notes">
          <div className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && saveNote()}
                   placeholder="Add a note"
                   className="flex-1 rounded-md border border-edge bg-base px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
            <button onClick={saveNote} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">Save</button>
          </div>
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded border border-edge px-3 py-2 text-sm">
                <p>{n.note}</p>
                <p className="mt-1 text-xs text-muted">{n.created_by ?? 'unknown'} · {shortDate(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </Section>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-2.5 text-xs uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </section>
  );
}
