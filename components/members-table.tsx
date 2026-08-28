'use client';

import { useMemo, useState } from 'react';
import { Panel, Table, Th, Td, Badge, UnverifiedName, Empty } from '@/components/ui';
import { MemberDrawer } from '@/components/member-drawer';
import { eur, shortDate, daysBetween, displayName, nameUnverified, toCsv } from '@/lib/format';

export type MemberRow = {
  person_id: string; email: string; full_name: string | null; name_source: string | null;
  tier: string | null; term_start: string | null; term_end: string | null;
  amount_eur: number | null; status: string;
};

type NameFilter = 'all' | 'verified' | 'unverified' | 'missing';

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');
  const [nameFilter, setNameFilter] = useState<NameFilter>('all');
  const [open, setOpen] = useState<MemberRow | null>(null);

  const tiers = useMemo(() => Array.from(new Set(rows.map((r) => r.tier).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tier !== 'all' && r.tier !== tier) return false;
    if (nameFilter === 'unverified' && r.name_source !== 'unverified_pending_review') return false;
    if (nameFilter === 'missing' && r.full_name) return false;
    if (nameFilter === 'verified' && nameUnverified(r.name_source, r.full_name)) return false;
    if (q) {
      const hay = `${r.full_name ?? ''} ${r.email}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, tier, nameFilter]);

  function exportCsv() {
    const csv = toCsv(filtered.map((r) => ({
      person_id: r.person_id, name: r.full_name ?? '', email: r.email,
      name_status: nameUnverified(r.name_source, r.full_name) ? 'unverified' : 'verified',
      tier: r.tier ?? '', term_start: r.term_start ?? '', term_end: r.term_end ?? '',
      amount_eur: r.amount_eur ?? '', status: r.status,
    })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `apc-members-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const unverifiedCount = rows.filter((r) => nameUnverified(r.name_source, r.full_name)).length;
  const input = 'rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent';

  return (
    <>
      <Panel
        title="Member directory"
        hint={`${filtered.length} of ${rows.length} active${unverifiedCount ? ` · ${unverifiedCount} unverified name${unverifiedCount === 1 ? '' : 's'}` : ''}`}
        right={<button onClick={exportCsv} className="rounded-md border border-edge px-2.5 py-1.5 text-xs text-muted hover:text-white">Export CSV</button>}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className={`${input} min-w-[220px] flex-1`} />
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={input}>
            <option value="all">All tiers</option>
            {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={nameFilter} onChange={(e) => setNameFilter(e.target.value as NameFilter)} className={input}>
            <option value="all">All names</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="missing">Missing</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <Empty>No members match these filters. Clear the search or widen the tier.</Empty>
        ) : (
          <Table>
            <thead><tr>
              <Th>Member</Th><Th>Email</Th><Th>Tier</Th><Th>Term start</Th><Th>Term end</Th>
              <Th className="text-right">Amount</Th><Th className="text-right">Days left</Th><Th>Status</Th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const unverified = nameUnverified(r.name_source, r.full_name);
                const left = daysBetween(r.term_end);
                return (
                  <tr key={r.person_id} onClick={() => setOpen(r)}
                      className="cursor-pointer border-t border-edge hover:bg-white/[0.02]">
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {unverified && <UnverifiedName />}
                        {displayName(r.full_name, r.email)}
                      </span>
                    </Td>
                    <Td className="text-muted">{r.email}</Td>
                    <Td className="text-muted">{r.tier ?? '—'}</Td>
                    <Td className="text-muted">{shortDate(r.term_start)}</Td>
                    <Td className="text-muted">{shortDate(r.term_end)}</Td>
                    <Td className="tnum text-right">{eur(r.amount_eur)}</Td>
                    <Td className="tnum text-right">{left ?? '—'}</Td>
                    <Td><Badge tone={r.status === 'active' ? 'good' : 'muted'}>{r.status}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      {open && <MemberDrawer member={open} onClose={() => setOpen(null)} />}
    </>
  );
}
