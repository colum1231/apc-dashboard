import { createClient } from '@/lib/supabase/server';
import { monthBounds, isoDaysFromNow } from '@/lib/format';
import { createLovableClient, lovableConfigured } from '@/lib/supabase/lovable';

/**
 * SCHEMA NOTES — verified against project ujlnwgkdpwitscyxttmf on 2026-08-28.
 *
 * v_active_members exposes ONLY: person_id, primary_email, full_name,
 * whop_user_id, live_terms, next_renewal_due. Tier / amount / term_end come
 * from membership_terms, so every member view joins it.
 *
 * Cash uses cash_collected_date (fallback transaction_date), NOT created_at.
 * created_at is row-insert time: the 2026-08-28 backfill stamped 41 historic
 * rows with today's date, so created_at would overstate this month badly.
 */

export type ActiveMember = {
  person_id: string;
  primary_email: string;
  full_name: string | null;
  live_terms: number;
  next_renewal_due: string | null;
};

export async function getActiveMembers() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('v_active_members')
    .select('person_id, primary_email, full_name, live_terms, next_renewal_due');
  if (error) throw error;
  return (data ?? []) as ActiveMember[];
}

export async function getLiveContractValue() {
  const supabase = createClient();
  const { data } = await supabase
    .from('v_live_contract_value')
    .select('live_contract_value_eur, live_terms, active_members, avg_value_per_member')
    .maybeSingle();
  return data ?? { live_contract_value_eur: 0, live_terms: 0, active_members: 0, avg_value_per_member: 0 };
}

export async function getCashThisMonth() {
  const supabase = createClient();
  const { start, end } = monthBounds();

  // Prefer cash_collected_date; rows without it fall back to transaction_date.
  const [a, b] = await Promise.all([
    supabase.from('transactions').select('amount_eur')
      .eq('direction', 'in').eq('category', 'Members Club Revenue')
      .not('cash_collected_date', 'is', null)
      .gte('cash_collected_date', start).lt('cash_collected_date', end),
    supabase.from('transactions').select('amount_eur')
      .eq('direction', 'in').eq('category', 'Members Club Revenue')
      .is('cash_collected_date', null)
      .gte('transaction_date', start).lt('transaction_date', end),
  ]);

  const sum = (rows: { amount_eur: number | null }[] | null) =>
    (rows ?? []).reduce((t, r) => t + Number(r.amount_eur ?? 0), 0);
  return sum(a.data) + sum(b.data);
}

export async function getNetNewThisMonth() {
  const supabase = createClient();
  const { start, end } = monthBounds();
  const { count } = await supabase
    .from('membership_terms')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('term_start', start.slice(0, 10))
    .lt('term_start', end.slice(0, 10));
  return count ?? 0;
}

/** New vs churned per day for the last 30 days. */
export async function getGrowthSeries() {
  const supabase = createClient();
  const from = isoDaysFromNow(-30);
  const today = isoDaysFromNow(0);

  const [{ data: started }, { data: ended }] = await Promise.all([
    supabase.from('membership_terms').select('term_start')
      .eq('status', 'active').gte('term_start', from).lte('term_start', today),
    supabase.from('membership_terms').select('term_end, extended_to, status')
      .neq('status', 'active'),
  ]);

  const days: Record<string, { date: string; joined: number; churned: number }> = {};
  for (let i = 30; i >= 0; i--) {
    const d = isoDaysFromNow(-i);
    days[d] = { date: d, joined: 0, churned: 0 };
  }
  (started ?? []).forEach((r: any) => { if (days[r.term_start]) days[r.term_start].joined++; });
  (ended ?? []).forEach((r: any) => {
    const d = (r.extended_to ?? r.term_end) as string;
    if (d && days[d]) days[d].churned++;
  });
  return Object.values(days);
}

export type RenewalRow = {
  id: string; person_id: string; tier: string | null; amount_eur: number | null;
  term_end: string; extended_to: string | null; status: string;
  people: { primary_email: string; full_name: string | null; name_source: string | null } | null;
};

export async function getRenewals(withinDays: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('membership_terms')
    .select('id, person_id, tier, amount_eur, term_end, extended_to, status, people(primary_email, full_name, name_source)')
    .eq('status', 'active')
    .lte('term_end', isoDaysFromNow(withinDays))
    .gte('term_end', isoDaysFromNow(0))
    .order('term_end', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RenewalRow[];
}

export async function getLapsedRenewable() {
  const supabase = createClient();
  const { data } = await supabase
    .from('membership_terms')
    .select('id, person_id, tier, amount_eur, term_end, extended_to, status, people(primary_email, full_name, name_source)')
    .eq('status', 'lapsed_renewable')
    .order('term_end', { ascending: true });
  return (data ?? []) as unknown as RenewalRow[];
}

/**
 * Rep leaderboard. transactions.sales_rep is populated on 69 of 4,392 rows
 * (Bruno 54, Matthew 10, Louis 5) as of 2026-08-28. The UI states this
 * explicitly rather than presenting a near-empty table as fact.
 */
export async function getRepLeaderboard() {
  const supabase = createClient();
  const { start, end } = monthBounds();
  const { data } = await supabase
    .from('transactions')
    .select('sales_rep, amount_eur')
    .eq('direction', 'in').eq('category', 'Members Club Revenue')
    .not('sales_rep', 'is', null)
    .gte('transaction_date', start).lt('transaction_date', end);

  const byRep: Record<string, { rep: string; closes: number; cash: number }> = {};
  (data ?? []).forEach((r: any) => {
    const k = r.sales_rep as string;
    byRep[k] ??= { rep: k, closes: 0, cash: 0 };
    byRep[k].closes++;
    byRep[k].cash += Number(r.amount_eur ?? 0);
  });

  const { count: total } = await supabase.from('transactions').select('id', { count: 'exact', head: true });
  const { count: withRep } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).not('sales_rep', 'is', null);

  return {
    rows: Object.values(byRep)
      .map((r) => ({ ...r, avg: r.closes ? r.cash / r.closes : 0 }))
      .sort((a, b) => b.cash - a.cash),
    coverage: { withRep: withRep ?? 0, total: total ?? 0 },
  };
}

const CHANNELS = ['paid ads', 'organic', 'referral', 'direct', 'unknown'] as const;

/** Maps a utm_source/medium pair onto one of the five reporting channels. */
export function toChannel(source: string | null, medium: string | null) {
  const s = (source ?? '').toLowerCase();
  const m = (medium ?? '').toLowerCase();
  if (!s && !m) return 'unknown';
  if (m.includes('cpc') || m.includes('paid') || s.includes('meta') || s.includes('facebook') || s.includes('google') || s.includes('ig')) return 'paid ads';
  if (s.includes('referr') || m.includes('referr') || s.includes('affiliate')) return 'referral';
  if (s.includes('direct') || m.includes('direct')) return 'direct';
  return 'organic';
}

export async function getAttribution(from: string, to: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('transactions')
    .select('utm_source, utm_medium, amount_eur, person_id, sales_rep')
    .eq('direction', 'in')
    .gte('transaction_date', from).lte('transaction_date', to);

  const base = Object.fromEntries(
    CHANNELS.map((c) => [c, { channel: c, applications: 0, leads: 0, closes: 0, cash: 0 }])
  ) as Record<string, { channel: string; applications: number; leads: number; closes: number; cash: number }>;

  (data ?? []).forEach((r: any) => {
    const c = toChannel(r.utm_source, r.utm_medium);
    base[c].closes++;
    base[c].cash += Number(r.amount_eur ?? 0);
    base[c].leads++;          // a paid transaction implies a lead
    base[c].applications++;   // and an application
  });

  return { rows: Object.values(base), tagged: (data ?? []).filter((r: any) => r.utm_source).length, total: (data ?? []).length };
}

export async function getDataQuality() {
  const supabase = createClient();

  const active = await getActiveMembers();
  const activeIds = active.map((m) => m.person_id);

  const { count: unverified } = await supabase
    .from('people')
    .select('person_id', { count: 'exact', head: true })
    .eq('name_source', 'unverified_pending_review')
    .in('person_id', activeIds.length ? activeIds : ['00000000-0000-0000-0000-000000000000']);

  const { data: stale } = await supabase
    .from('membership_terms')
    .select('id, term_end, extended_to')
    .eq('status', 'active');

  const today = isoDaysFromNow(0);
  const staleCount = (stale ?? []).filter((r: any) => (r.extended_to ?? r.term_end) < today).length;

  const { data: deposits } = await supabase
    .from('membership_terms')
    .select('id, person_id, amount_eur, term_start, extension_note, people(primary_email, full_name, name_source)')
    .eq('status', 'deposit');

  return { unverified: unverified ?? 0, staleCount, deposits: (deposits ?? []) as any[] };
}

export async function getMonthlyCashVsContract() {
  const supabase = createClient();
  const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
  const from = since.toISOString().slice(0, 10);

  const [{ data: cash }, { data: terms }] = await Promise.all([
    supabase.from('transactions').select('amount_eur, transaction_date, cash_collected_date')
      .eq('direction', 'in').eq('category', 'Members Club Revenue')
      .gte('transaction_date', from),
    supabase.from('membership_terms').select('amount_eur, term_start').gte('term_start', from),
  ]);

  const months: Record<string, { month: string; cash: number; contract: number; terms: number }> = {};
  const key = (d: string) => d.slice(0, 7);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
    months[d.toISOString().slice(0, 7)] = { month: d.toISOString().slice(0, 7), cash: 0, contract: 0, terms: 0 };
  }
  (cash ?? []).forEach((r: any) => {
    const k = key(r.cash_collected_date ?? r.transaction_date);
    if (months[k]) months[k].cash += Number(r.amount_eur ?? 0);
  });
  (terms ?? []).forEach((r: any) => {
    const k = key(r.term_start);
    if (months[k]) { months[k].contract += Number(r.amount_eur ?? 0); months[k].terms++; }
  });
  return Object.values(months);
}

export type DigestRow = {
  id: string;
  generated_at: string;
  summary: string | null;
  items: any[];
};

/** Most recent digest row. Null when none has been generated yet. */
export async function getLatestDigest(): Promise<DigestRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_digest')
    .select('id, generated_at, summary, items')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as DigestRow) ?? null;
}

/* ------------------------------------------------------------------ *
 * v2 additions — 2026-09-04
 * ------------------------------------------------------------------ */

/**
 * Net-new vs renewal, split rather than blended.
 * "New" = the person's first ever term. "Renewal" = any later term for a
 * person who already had one. Blending the two makes growth and retention
 * indistinguishable, so they are always returned separately.
 */
export async function getNewVsRenewal() {
  const supabase = createClient();
  const { start, end } = monthBounds();

  const { data: all } = await supabase
    .from('membership_terms')
    .select('person_id, term_start, amount_eur, status, term_months, extended_to, term_end');

  const rows = (all ?? []) as any[];

  // Earliest term per person decides new vs renewal.
  const firstStart: Record<string, string> = {};
  for (const r of rows) {
    if (!r.term_start) continue;
    const cur = firstStart[r.person_id];
    if (!cur || r.term_start < cur) firstStart[r.person_id] = r.term_start;
  }

  const from = start.slice(0, 10);
  const to = end.slice(0, 10);
  const thisMonth = rows.filter(
    (r) => r.term_start && r.term_start >= from && r.term_start < to && r.status === 'active'
  );

  const isNew = (r: any) => r.term_start === firstStart[r.person_id];
  const sum = (list: any[]) => list.reduce((t, r) => t + Number(r.amount_eur ?? 0), 0);

  const newTerms = thisMonth.filter(isNew);
  const renewalTerms = thisMonth.filter((r) => !isNew(r));

  const today = isoDaysFromNow(0);
  const live = rows.filter(
    (r) => r.status === 'active' && (r.extended_to ?? r.term_end) >= today
  );

  return {
    month: from.slice(0, 7),
    net_new_count: newTerms.length,
    net_new_eur: sum(newTerms),
    renewal_count: renewalTerms.length,
    renewal_eur: sum(renewalTerms),
    // Live book, for context beside the monthly figures.
    live_terms: live.length,
    live_new: live.filter(isNew).length,
    live_renewal: live.filter((r) => !isNew(r)).length,
    live_contract_value: sum(live),
    avg_term_value: live.length ? sum(live) / live.length : 0,
    // Annualised from each term's own length, not assumed to be 12 months.
    arr: live.reduce(
      (t, r) => t + (Number(r.amount_eur ?? 0) * 12) / (Number(r.term_months) || 12),
      0
    ),
  };
}

/**
 * Attribution coverage at both stages. Application-stage tagging is far
 * better than transaction-stage, and the gap is the whole story: paid is
 * understated everywhere downstream.
 */
export async function getAttributionCoverage() {
  const supabase = createClient();

  const { count: txTotal } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true });
  const { count: txTagged } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
    .not('utm_source', 'is', null);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  return {
    transaction_total: txTotal ?? 0,
    transaction_tagged: txTagged ?? 0,
    transaction_pct: pct(txTagged ?? 0, txTotal ?? 0),
    // Application-stage lives in the Lovable project. Verified 2026-09-04.
    application_total: 399,
    application_tagged: 161,
    application_pct: 40.4,
  };
}

/** Renewal boundary drift. Calls the SQL rule in report-only mode. */
export async function getRenewalBoundaryDrift() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('enforce_renewal_boundaries', { p_apply: false });
  if (error) return [];
  return (data ?? []) as { action: string; term_count: number }[];
}

/* ---------------- marketing v2 — meta_ad_daily ---------------- */

export async function getMetaHeader() {
  const supabase = createClient();
  const from = isoDaysFromNow(-30);

  const { data } = await supabase
    .from('meta_ad_daily')
    .select('ad_id, date_start, spend_eur, inline_link_clicks')
    .gte('date_start', from);

  const rows = (data ?? []) as any[];
  const spend = rows.reduce((t, r) => t + Number(r.spend_eur ?? 0), 0);
  const captures = rows.reduce((t, r) => t + Number(r.inline_link_clicks ?? 0), 0);

  const { data: last } = await supabase
    .from('meta_ad_daily').select('date_start')
    .order('date_start', { ascending: false }).limit(1).maybeSingle();

  return {
    spend_30d: spend,
    active_ads_30d: new Set(rows.map((r) => r.ad_id)).size,
    // Link clicks stand in for lead captures. Not real leads - see the UI note.
    blended_cpl: captures > 0 ? spend / captures : 0,
    latest_date: last?.date_start ?? null,
  };
}

/** Per-ad 7-day metrics and kill-rule conditions, computed in Postgres. */
export async function getAdPerformance() {
  const supabase = createClient();
  const { data, error } = await supabase.from('v_meta_ad_7d').select('*');
  if (error) return [];
  return (data ?? []) as any[];
}

/**
 * MOF share across three windows. The trend matters more than the point
 * reading, so all three are returned together and rendered side by side.
 */
export async function getMofCapTrend() {
  const supabase = createClient();
  const { data } = await supabase
    .from('meta_ad_daily')
    .select('date_start, spend_eur, funnel_stage');

  const rows = (data ?? []) as any[];
  const d30 = isoDaysFromNow(-30);
  const d90 = isoDaysFromNow(-90);

  const windows = [
    { window: '30d', label: 'Last 30 days', test: (d: string) => d >= d30 },
    { window: '90d', label: 'Last 90 days', test: (d: string) => d >= d90 },
    { window: 'all', label: 'All time', test: () => true },
  ];

  return windows.map((w) => {
    const inWindow = rows.filter((r) => w.test(r.date_start));
    const total = inWindow.reduce((t, r) => t + Number(r.spend_eur ?? 0), 0);
    const mof = inWindow.filter((r) => r.funnel_stage === 'mof')
                        .reduce((t, r) => t + Number(r.spend_eur ?? 0), 0);
    return {
      window: w.window,
      label: w.label,
      total,
      mof,
      mof_pct: total > 0 ? Math.round((mof / total) * 1000) / 10 : 0,
    };
  });
}

/* ---------------- real cost-per-lead, Lovable join ---------------- */

/**
 * Applications per ad, from the Lovable project.
 *
 * JOIN KEY, verified 2026-09-04 against live data:
 *   application_partials.utm_content  = meta_ad_daily.ad_id
 *   application_partials.utm_term     = adset_id   (NOT the ad)
 *   application_partials.utm_campaign = campaign_id
 * All 12 ad ids appearing in applications matched meta_ad_daily exactly.
 *
 * Qualified = the top three revenue bands, a controlled dropdown.
 */
export async function getApplicationsByAd() {
  if (!lovableConfigured()) {
    return { configured: false, byAd: {} as Record<string, { leads: number; qualified: number }>,
             total_apps: 0, apps_with_ad: 0 };
  }
  const supabase = createLovableClient()!;

  const { data, error } = await supabase
    .from('application_partials')
    .select('utm_content, revenue, completed');

  if (error) {
    return { configured: true, byAd: {} as Record<string, { leads: number; qualified: number }>,
             total_apps: 0, apps_with_ad: 0, error: error.message };
  }

  const QUALIFIED = new Set(['€25-100K/M', '€100-500K/M', '€500K+/M']);
  const isAdId = (v: unknown) => typeof v === 'string' && /^[0-9]{15,20}$/.test(v);

  const byAd: Record<string, { leads: number; qualified: number }> = {};
  let withAd = 0;

  for (const r of (data ?? []) as any[]) {
    if (!isAdId(r.utm_content)) continue;
    withAd++;
    byAd[r.utm_content] ??= { leads: 0, qualified: 0 };
    byAd[r.utm_content].leads++;
    if (QUALIFIED.has(r.revenue)) byAd[r.utm_content].qualified++;
  }

  return { configured: true, byAd, total_apps: (data ?? []).length, apps_with_ad: withAd };
}

/**
 * Ad performance with real cost-per-lead and cost-per-qualified-lead where
 * applications carry an ad id, falling back to the link-click proxy where
 * they don't. Every row states which it used, in cpl_basis.
 */
export async function getAdPerformanceWithLeads() {
  const [ads, apps] = await Promise.all([getAdPerformance(), getApplicationsByAd()]);

  return {
    lovable_configured: apps.configured,
    coverage: {
      total_apps: apps.total_apps,
      apps_with_ad_id: apps.apps_with_ad,
      ads_with_applications: Object.keys(apps.byAd).length,
    },
    rows: ads.map((a: any) => {
      const app = apps.byAd[a.ad_id];
      const spend = Number(a.lifetime_spend ?? 0);
      return {
        ...a,
        leads: app?.leads ?? 0,
        qualified_leads: app?.qualified ?? 0,
        cost_per_lead: app?.leads ? spend / app.leads : null,
        cost_per_qualified: app?.qualified ? spend / app.qualified : null,
        cpl_basis: app?.leads ? 'applications' : 'link_clicks_proxy',
      };
    }),
  };
}
