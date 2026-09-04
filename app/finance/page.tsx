import Link from 'next/link';
import { Panel, Table, Th, Td, Stat, Badge, Notice, UnverifiedName, Empty } from '@/components/ui';
import { CashVsContract } from '@/components/charts';
import { getMonthlyCashVsContract, getDataQuality, getNewVsRenewal, getRenewalBoundaryDrift } from '@/lib/queries';
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
  { item: 'One stray 14-month term', detail: '346 of 347 terms are 12 months. 12 is the standard; the single 14-month row created 2026-08-27 is an outlier to correct.' },
  { item: 'RLS on backup tables', detail: 'membership_terms_backup_20260826 and the 20260828 set have RLS disabled.' },
  { item: 'Ad-level attribution coverage', detail: 'Only 12 of 645 Meta ads have any application attached. Most ad spend has no lead figure.' },
];

export default async function FinancePage() {
  const supabase = createClient();
  const [monthly, dq, split, drift, { data: terms }] = await Promise.all([
    getMonthlyCashVsContract(),
    getDataQuality(),
    getNewVsRenewal(),
    getRenewalBoundaryDrift(),
    supabase.from('membership_terms').select('term_start, amount_eur, status'),
  ]);

  const driftTotal = drift.reduce((t, d) => t + Number(d.term_count ?? 0), 0);

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="ARR (annualised)" value={eur(split.arr)} sub="Each term annualised on its own length, not assumed 12m" />
        <Stat label="Live contract value" value={eur(split.live_contract_value)} sub={`${num(split.live_terms)} live terms`} />
        <Stat label="Average term value" value={eur(split.avg_term_value)} sub="Across the live book" />
        <Stat
          label="New vs renewal"
          value={`${num(split.live_new)} / ${num(split.live_renewal)}`}
          sub="Live terms: first-time vs returning"
        />
      </div>

      <Panel title="Not computed — and why" hint="Shown rather than estimated">
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start justify-between gap-4 border-b border-edge pb-2.5">
            <div>
              <p>CAC</p>
              <p className="mt-0.5 text-xs text-muted">
                Meta spend is now ad-level and daily, but only 12 of 645 ads have applications attached
                and 97.7% of transactions carry no source. The denominator is still missing.
              </p>
            </div>
            <Badge tone="warn">uncomputable</Badge>
          </li>
          <li className="flex items-start justify-between gap-4 border-b border-edge pb-2.5">
            <div>
              <p>LTV</p>
              <p className="mt-0.5 text-xs text-muted">
                Needs retention across full cycles. Renewal outcomes have only been tracked since 4 Sep 2026.
              </p>
            </div>
            <Badge tone="warn">uncomputable</Badge>
          </li>
          <li className="flex items-start justify-between gap-4 border-b border-edge pb-2.5">
            <div>
              <p>Gross margin</p>
              <p className="mt-0.5 text-xs text-muted">
                No cost data in this database. Zoho Books is not connected, so there is no
                cost of delivery to subtract.
              </p>
            </div>
            <Badge tone="warn">uncomputable</Badge>
          </li>
          <li className="flex items-start justify-between gap-4 border-b border-edge pb-2.5">
            <div>
              <p>Cash position</p>
              <p className="mt-0.5 text-xs text-muted">
                No bank balance feed. Cash collected is tracked; the actual balance is not.
              </p>
            </div>
            <Badge tone="warn">uncomputable</Badge>
          </li>
          <li className="flex items-start justify-between gap-4">
            <div>
              <p>Renewal conversion rate</p>
              <p className="mt-0.5 text-xs text-muted">
                Churn itself is computable from membership_terms back to Aug 2024. What is missing is
                whether a lapse was chased and lost, or never chased.
              </p>
            </div>
            <Badge tone="warn">uncomputable</Badge>
          </li>
        </ul>
      </Panel>

      {driftTotal > 0 && (
        <Panel title="Renewal boundary drift" hint="180-day cutoff, checked live">
          <Table>
            <thead><tr><Th>Rule</Th><Th className="text-right">Terms out of bounds</Th></tr></thead>
            <tbody>
              {drift.map((d) => (
                <tr key={d.action} className="border-t border-edge">
                  <Td className="text-muted">{d.action.replace(/_/g, ' ')}</Td>
                  <Td className="tnum text-right"><Badge tone={d.term_count > 0 ? 'warn' : 'good'}>{num(d.term_count)}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4">
            <Notice>
              The 180-day cutoff runs nightly at 01:00 UTC via pg_cron. Anything showing here drifted
              out of bounds since the last run and will clear on the next one. A persistently non-zero
              count means the job has stopped.
            </Notice>
          </div>
        </Panel>
      )}

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
