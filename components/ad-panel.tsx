'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Badge, Empty, Notice } from '@/components/ui';
import { eur, num, shortDate } from '@/lib/format';

/**
 * "Currently running" = the ad has a row on the single most recent date_start
 * in meta_ad_daily. NOT "delivered at some point in the last 30 days" — that
 * counts ads switched off weeks ago, which is why the old header stat read
 * 99 when only 23 were actually live.
 */

function pctBadge(v: number | null, invert = false) {
  if (v == null) return <span className="text-muted">—</span>;
  const bad = invert ? v > 0 : v < 0;
  const tone = Math.abs(v) < 10 ? 'muted' : bad ? 'bad' : 'good';
  return <Badge tone={tone as any}>{v > 0 ? '+' : ''}{v}%</Badge>;
}

function verdict(a: any) {
  const conds = [a.cond_frequency, a.cond_ctr_decay, a.cond_cost_rise].filter(Boolean).length;
  if (conds === 3) return <Badge tone="bad">kill</Badge>;
  if (a.cond_frequency) return <Badge tone="warn">watch</Badge>;
  if (!a.cond_ctr_decay && !a.cond_cost_rise && Number(a.spend_7d) > 0)
    return <Badge tone="good">double down</Badge>;
  return <Badge tone="muted">hold</Badge>;
}

export function AdPanel({
  stage, rows, latestDate,
}: { stage: 'tof' | 'mof'; rows: any[]; latestDate: string | null }) {
  const [runningOnly, setRunningOnly] = useState(false);

  const running = rows.filter((a) => a.currently_running);
  const shown = (runningOnly ? running : rows).slice(0, 25);

  const label = stage === 'tof' ? 'Top of funnel' : 'Middle of funnel';
  const threshold = stage === 'tof' ? '3.5' : '6.0';
  const judged = stage === 'tof'
    ? 'judged on cost per lead'
    : "judged against each ad's own history only";

  return (
    <Panel
      title={label}
      hint={`${num(rows.length)} delivered in the window · ${num(running.length)} running today · fatigue threshold ${threshold} · ${judged}`}
      right={
        <button
          onClick={() => setRunningOnly((v) => !v)}
          className={
            runningOnly
              ? 'rounded-md border border-accent px-2.5 py-1.5 text-xs text-accent'
              : 'rounded-md border border-edge px-2.5 py-1.5 text-xs text-muted hover:text-white'
          }
        >
          {runningOnly ? `Showing running only (${num(running.length)})` : 'Show running only'}
        </button>
      }
    >
      {stage === 'mof' && (
        <div className="mb-4">
          <Notice tone="accent">
            MOF ads are compared only to their own history, never to TOF. TOF will always look
            more expensive per qualified lead because MOF re-touches people prospecting already
            paid to acquire — benchmarking the two together drains budget out of prospecting.
          </Notice>
        </div>
      )}

      {shown.length === 0 ? (
        <Empty>
          {runningOnly
            ? `No ${stage.toUpperCase()} ads ran on ${shortDate(latestDate)}.`
            : `No ${stage.toUpperCase()} ads with recent delivery.`}
        </Empty>
      ) : (
        <Table>
          <thead><tr>
            <Th>Ad</Th>
            <Th>Status</Th>
            <Th className="text-right">Spend 7d</Th>
            <Th className="text-right">Freq 7d</Th>
            <Th className="text-right">CTR vs own baseline</Th>
            <Th className="text-right">{stage === 'mof' ? 'Cost/qualified' : 'Cost/lead'}</Th>
            <Th className="text-right">Leads</Th>
            <Th>Verdict</Th>
          </tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.ad_id} className="border-t border-edge align-top">
                <Td className="whitespace-normal">
                  <span className="block max-w-[22rem] truncate">{a.ad_name ?? a.ad_id}</span>
                  <span className="mt-0.5 block max-w-[22rem] truncate text-xs text-muted">{a.campaign_name}</span>
                </Td>
                <Td>
                  {a.currently_running
                    ? <Badge tone="good">running</Badge>
                    : <Badge tone="muted">off</Badge>}
                </Td>
                <Td className="tnum text-right">{eur(a.spend_7d)}</Td>
                <Td className="tnum text-right">
                  {a.frequency_7d ?? '—'}
                  <span className="ml-1 text-xs text-muted">/ {a.fatigue_threshold}</span>
                </Td>
                <Td className="tnum text-right">{pctBadge(a.ctr_change_pct)}</Td>
                <Td className="tnum text-right">
                  {stage === 'mof'
                    ? (a.cost_per_qualified != null ? eur(a.cost_per_qualified) : <span className="text-muted">—</span>)
                    : (a.cost_per_lead != null ? eur(a.cost_per_lead) : <span className="text-muted">—</span>)}
                </Td>
                <Td className="tnum text-right">
                  {a.leads > 0
                    ? <span>{num(a.leads)}<span className="ml-1 text-xs text-muted">/ {num(a.qualified_leads)} qual</span></span>
                    : <span className="text-muted">—</span>}
                </Td>
                <Td>{verdict(a)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
