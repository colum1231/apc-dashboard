import { Panel, Stat, Notice, Table, Th, Td, Badge, Empty } from '@/components/ui';
import { getMetaHeader, getAdPerformanceWithLeads, getMofCapTrend } from '@/lib/queries';
import { eur, num, shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * /marketing — Meta only.
 *
 * Two rules from the spec that must not be quietly relaxed:
 *   1. TOF and MOF are never judged against each other. Different thresholds,
 *      different metrics. A shared benchmark always flatters MOF, because
 *      prospecting already paid to acquire the people MOF re-touches.
 *   2. The kill rule needs ALL THREE conditions. Frequency alone is a watch
 *      flag, never a kill.
 */

function pctBadge(v: number | null, invert = false) {
  if (v == null) return <span className="text-muted">—</span>;
  const bad = invert ? v > 0 : v < 0;
  const tone = Math.abs(v) < 10 ? 'muted' : bad ? 'bad' : 'good';
  return <Badge tone={tone as any}>{v > 0 ? '+' : ''}{v}%</Badge>;
}

function AdTable({ rows, stage }: { rows: any[]; stage: 'tof' | 'mof' }) {
  if (rows.length === 0) return <Empty>No {stage.toUpperCase()} ads with recent delivery.</Empty>;
  return (
    <Table>
      <thead><tr>
        <Th>Ad</Th>
        <Th className="text-right">Spend 7d</Th>
        <Th className="text-right">Freq 7d</Th>
        <Th className="text-right">CTR vs own baseline</Th>
        <Th className="text-right">{stage === 'mof' ? 'Cost/qualified' : 'Cost/lead'}</Th>
        <Th className="text-right">Leads</Th>
        <Th>Verdict</Th>
      </tr></thead>
      <tbody>
        {rows.map((a) => {
          const conds = [a.cond_frequency, a.cond_ctr_decay, a.cond_cost_rise].filter(Boolean).length;
          const kill = conds === 3;
          const watch = a.cond_frequency && !kill;
          const strong = !a.cond_ctr_decay && !a.cond_cost_rise && Number(a.spend_7d) > 0;
          return (
            <tr key={a.ad_id} className="border-t border-edge align-top">
              <Td className="whitespace-normal">
                <span className="block max-w-[24rem] truncate">{a.ad_name ?? a.ad_id}</span>
                <span className="mt-0.5 block max-w-[24rem] truncate text-xs text-muted">{a.campaign_name}</span>
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
              <Td>
                {kill ? <Badge tone="bad">kill</Badge>
                  : watch ? <Badge tone="warn">watch</Badge>
                  : strong ? <Badge tone="good">double down</Badge>
                  : <Badge tone="muted">hold</Badge>}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default async function MarketingPage() {
  const [header, perf, cap] = await Promise.all([
    getMetaHeader(), getAdPerformanceWithLeads(), getMofCapTrend(),
  ]);
  const ads = perf.rows;

  const tof = ads.filter((a) => a.funnel_stage === 'tof' && Number(a.spend_7d) > 0)
                 .sort((a, b) => Number(b.spend_7d) - Number(a.spend_7d));
  const mof = ads.filter((a) => a.funnel_stage === 'mof' && Number(a.spend_7d) > 0)
                 .sort((a, b) => Number(b.spend_7d) - Number(a.spend_7d));

  const watching = ads.filter((a) => a.cond_frequency);
  const killing = ads.filter((a) => a.cond_frequency && a.cond_ctr_decay && a.cond_cost_rise);
  const decaying = ads.filter((a) => a.cond_ctr_decay || a.cond_cost_rise);

  const capNow = cap.find((c) => c.window === '30d');
  const overCap = (capNow?.mof_pct ?? 0) > 25;

  return (
    <div className="space-y-5">
      {overCap && (
        <Notice tone="bad">
          MOF is {capNow?.mof_pct}% of spend over the last 30 days, against a 15–25% target.
          Share has moved {cap.map((c) => `${c.mof_pct}%`).reverse().join(' → ')} across
          all-time, 90-day and 30-day windows. Whether that is drift or a deliberate shift is a
          budget decision, not something this page can answer.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Spend, last 30 days" value={eur(header.spend_30d)} sub={`${num(header.active_ads_30d)} ads delivering`} />
        <Stat
          label="MOF share, 30 days"
          value={`${capNow?.mof_pct ?? 0}%`}
          tone={overCap ? 'bad' : 'good'}
          sub="Target band 15–25%"
        />
        <Stat label="Blended cost per lead capture" value={eur(header.blended_cpl)} sub="Spend ÷ link clicks, 30 days" />
        <Stat label="Ads with live delivery" value={num(tof.length + mof.length)} sub={`${num(tof.length)} TOF · ${num(mof.length)} MOF`} />
      </div>

      {!perf.lovable_configured && (
        <Notice>
          Lovable env vars are not set, so cost-per-lead falls back to the link-click proxy.
          Add NEXT_PUBLIC_LOVABLE_SUPABASE_URL and NEXT_PUBLIC_LOVABLE_SUPABASE_ANON_KEY in Vercel
          to switch to real application counts.
        </Notice>
      )}

      {perf.lovable_configured && (
        <Notice>
          Cost per lead uses real applications joined on utm_content = ad_id.
          {' '}{num(perf.coverage.apps_with_ad_id)} of {num(perf.coverage.total_apps)} applications carry an ad id,
          covering {num(perf.coverage.ads_with_applications)} ads. Ads without applications show a dash rather
          than a fabricated number.
        </Notice>
      )}

      <Panel title="MOF spend cap" hint="Three windows — the trend is the signal, not the single figure">
        <Table>
          <thead><tr>
            <Th>Window</Th><Th className="text-right">Total spend</Th>
            <Th className="text-right">MOF spend</Th><Th
