import Link from 'next/link';
import { Panel, Table, Th, Td, Stat, Badge, Notice, UnverifiedName, Empty } from '@/components/ui';
import { CashVsContract } from '@/components/charts';
import { getMonthlyCashVsContract, getDataQuality } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { eur, num, shortDate, daysBetween, displayName, nameUnverified } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Schema debt carried forward from the 2026-08-28 backfill session.
 * Hardcoded deliberately — these are decisions, not derivable state.
 */
const SCHEMA_DEBT = [
  { item: 'instalment_group unpopulated', detail: 'Column exists on transactions but is not written by any pipeline.' },
  { item: 'transaction_id single column', detail: 'membership_terms.transaction_id holds one id; split payments cannot be represented.' },
  { item: '14-month term rule unconfirmed', detail: '344 of 345 existing terms are 12 months. The single 14-month row looks like the bug.' },
  { item: 'RLS on backup tables', detail: 'membership_terms_backup_20260826 and the 20260828 set have RLS disabled.' },
];

export default async function FinancePage() {
  const supabase = createClient();
  const [monthly, dq, { data: terms }] = await Promise.all([
    getMonthlyCashVsContract(),
    getDataQuality(),
    supabase.from('membership_terms').select('term_start, amount_eur, status'),
  ]);

  const outstanding = dq.deposits.reduce((t: number, d: any) => {
    const full = parseFullValue(d.extension_note);
    return t + (full == null ? 0 : full - Number(d.amount_eur ?? 0));
  }, 0);

  // Deferred: contract value started per month vs cash collected in that month.
  const deferred: Record<string, { month: string; terms: number; contract: number }> = {};
  (terms ?? []).forEach((t: any) => {
    if (!t.term_start) return;
    const k = t.term_start.slice(0, 7);
    deferred[k] ??= { month: k, terms: 0, contract: 0 };
    deferred[k].terms++;
    deferred[k].contract += Number(t.amount_eur ?? 0);
  });
  const cashByMonth = Object.fromEntries(monthly.map((m) => [m.month, m.cash]));
  const deferredRows = Object.values(deferred).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);

  return (
    <div className="space-y-5">
      <Panel title="Monthly cash vs contract value" hint="Last 12 months">
        <CashVsContract data={monthly} />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Unverified names"
          value={num(dq.unverified)}
          tone={dq.unverified > 0 ? 'warn' : 'good'}
          sub="Active members pending review"
        />
        <Stat
          label="Stale active terms"
          value={num(dq.staleCount)}
          tone={dq.staleCount > 0 ? 'bad' : 'good'}
          sub="Status active but end date passed"
        />
        <Stat label="Deposit cohort" value={num(dq.deposits.length)} tone={dq.deposits.length ? 'warn' : 'good'} sub="Terms awaiting balance" />
        <Stat label="Deposit outstanding" value={eur(outstanding)} tone={outstanding > 0 ? 'warn' : 'good'} sub="Where a full value is recorded" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Data quality flags">
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-start justify-between gap-4 border-b border-edge pb-2.5">
              <div>
                <p>Members with unverified names</p>
                <p className="mt-0.5 text-xs text-muted">Names cleared on 2026-08-28 pending founder review.</p>
              </div>
              <Link href="/members?name=unverified" className="shrink-0 text-accent hover:underline">
                {num(dq.unverified)} →
              </Link>
            </li>
            <li className="flex items-start justify-between gap-4 border-b border-edge pb-2.5">
              <div>
                <p>Stale active terms</p>
                <p className="mt-0.5 text-xs text-muted">status = active but COALESCE(extended_to, term_end) is in the past.</p>
              </div>
              <Badge tone={dq.staleCount > 0 ? 'bad' : 'good'}>{num(dq.staleCount)}</Badge>
            </li>
            {SCHEMA_DEBT.map((d) => (
              <li key={d.item} className="flex items-start justify-between gap-4 border-b border-edge pb-2.5 last:border-0">
                <div>
                  <p>{d.item}</p>
                  <p className="mt-0.5 text-xs text-muted">{d.detail}</p>
                </div>
                <Badge tone="warn">open</Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Deposit cohort" hint="Terms with status = deposit">
          {dq.deposits.length === 0 ? <Empty>No deposit terms outstanding.</Empty> : (
            <>
              <Table>
                <thead><tr>
                  <Th>Member</Th><Th className="text-right">Deposit</Th><Th className="text-right">Full value</Th>
                  <Th className="text-right">Outstanding</Th><Th className="text-right">Days</Th>
                </tr></thead>
                <tbody>
                  {dq.deposits.map((d: any) => {
                    const p = d.people;
                    const full = parseFullValue(d.extension_note);
                    const paid = Number(d.amount_eur ?? 0);
                    const since = daysBetween(d.term_start);
                    return (
                      <tr key={d.id} className="border-t border-edge">
                        <Td>
                          <span className="flex items-center gap-1.5">
                            {nameUnverified(p?.name_source, p?.full_name) && <UnverifiedName />}
                            {displayName(p?.full_name, p?.primary_email ?? '—')}
                          </span>
                        </Td>
                        <Td className="tnum text-right">{eur(paid)}</Td>
                        <Td className="tnum text-right">{full == null ? '—' : eur(full)}</Td>
                        <Td className="tnum text-right text-warn">{full == null ? '—' : eur(full - paid)}</Td>
                        <Td className="tnum text-right text-muted">{since == null ? '—' : Math.abs(since)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <div className="mt-4">
                <Notice>
                  Full contract value is parsed from extension_note. membership_terms has no notes column,
                  so any deposit without a euro figure in that note shows as —.
                </Notice>
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Deferred revenue" hint="Contract value started per month against cash collected">
        <Table>
          <thead><tr>
            <Th>Month</Th><Th className="text-right">Terms started</Th><Th className="text-right">Contract value</Th>
            <Th className="text-right">Cash collected</Th><Th className="text-right">Deferred balance</Th>
          </tr></thead>
          <tbody>
            {deferredRows.map((r) => {
              const cash = Number(cashByMonth[r.month] ?? 0);
              return (
                <tr key={r.month} className="border-t border-edge">
                  <Td>{r.month}</Td>
                  <Td className="tnum text-right">{num(r.terms)}</Td>
                  <Td className="tnum text-right">{eur(r.contract)}</Td>
                  <Td className="tnum text-right">{eur(cash)}</Td>
                  <Td className="tnum text-right text-muted">{eur(r.contract - cash)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

/** Pulls a euro figure out of a free-text note, e.g. "full value 12000". */
function parseFullValue(note: string | null): number | null {
  if (!note) return null;
  const m = note.replace(/[, ]/g, '').match(/(?:€|eur)?(\d{3,7}(?:\.\d{1,2})?)/i);
  return m ? Number(m[1]) : null;
}
