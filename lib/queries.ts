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
 * STANDING RULE (2026-09-04): never pull a full table to aggregate in JS.
 * PostgREST caps responses at 1,000 rows and returns NO error, so the failure
 * is silent and the number looks wrong-but-plausible. It cost us a EUR 6,550 /
 * 34.1% MOF reading against a real EUR 68,935 / 40.7%. Any new aggregate gets
 * a Postgres view. Every raw .from() below is bounded by a filter, a count
 * head request, or maybeSingle().
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

/** New vs churned per day for the last 30 days. Aggregated in Postgres. */
export async function getGrowthSeries() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('v_growth_30d')
    .select('date, joined, churned')
    .order('date', { ascending: true });
  if (error) return [];
  return (data ?? []).map((r: any) => ({
    date: r.date as string,
    joined: Number(r.joined ?? 0),
    churned: Number(r.churned ?? 0),
  }));
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
  const { data, error } = await supabase
    .from('v_monthly_cash_vs_contract')
    .select('month, cash, contract, terms')
    .order('month', { ascending: true });
  if (error) return [];
  return (data ?? []).map((r: any) => ({
    month: r.month as string,
    cash: Number(r.cash ?? 0),
    contract: Number(r.contract ?? 0),
    terms: Number(r.terms ?? 0),
  }));
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
 * Net-new vs renewal, split rather than blended, aggregated in Postgres.
 * "New" = the person's first ever term. Blending the two makes growth and
 * retention indistinguishable, so they are always returned separately.
 *
 * Excludes not_a_membership and paid_not_in_ledger, per the 2026-09-04 rule.
 */
export async function getNewVsRenewal() {
  const supabase = createClient();
  const { data } = await supabase
    .from('v_new_vs_renewal')
    .select('*')
    .maybeSingle();

  const r = (data ?? {}) as any;
  return {
    month: r.month ?? '',
    net_new_count: Number(r.net_new_count ?? 0),
    net_new_eur: Number(r.net_new_eur ?? 0),
    renewal_count: Number(r.renewal_count ?? 0),
    renewal_eur: Number(r.renewal_eur ?? 0),
    live_terms: Number(r.live_terms ?? 0),
    live_new: Number(r.live_new ?? 0),
    live_renewal: Number(r.live_renewal ?? 0),
    live_contract_value: Number(r.live_contract_value ?? 0),
    avg_term_value: Number(r.avg_term_value ?? 0),
    arr: Number(r.arr ?? 0),
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
    // Application-stage lives in the Lovable project, which this app does not
    // connect to. Verified 2026-09-04: 161 of 399 = 40.4%.
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
  const { data } = await supabase
    .from('v_meta_header_30d')
    .select('spend_30d, active_ads_30d, link_clicks_30d, blended_cpl, latest_date, ads_running_now, spend_latest_day')
    .maybeSingle();

  const r = (data ?? {}) as any;
  return {
    spend_30d: Number(r.spend_30d ?? 0),
    active_ads_30d: Number(r.active_ads_30d ?? 0),
    // Link clicks stand in for lead captures. Not real leads - see the UI note.
    blended_cpl: Number(r.blended_cpl ?? 0),
    latest_date: r.latest_date ?? null,
    // Ads with a row on the single most recent date_start - i.e. live today.
    // Distinct from active_ads_30d, which counts anything that delivered at
    // any point in the window including ads switched off weeks ago.
    ads_running_now: Number(r.ads_running_now ?? 0),
    spend_latest_day: Number(r.spend_latest_day ?? 0),
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
 * MOF share across three windows, aggregated in Postgres.
 *
 * DO NOT pull meta_ad_daily rows and sum them client-side. PostgREST caps at
 * 1,000 rows by default and returns no error, which silently produced a
 * EUR 6,550 / 34.1% reading against a real EUR 68,935 / 40.7%.
 */
export async function getMofCapTrend() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('v_meta_mof_cap')
    .select('window_key, label, sort_order, total_spend, mof_spend, mof_pct')
    .order('sort_order', { ascending: true });

  if (error) return [];

  return (data ?? []).map((r: any) => ({
    window: r.window_key,
    label: r.label,
    total: Number(r.total_spend ?? 0),
    mof: Number(r.mof_spend ?? 0),
    mof_pct: Number(r.mof_pct ?? 0),
  }));
}

/* ---------------- real cost-per-lead, Lovable join ---------------- */

/**
 * Applications per ad, from the Lovable project.
 *
 * READS A VIEW, NOT THE TABLE. application_partials has anon INSERT and UPDATE
 * policies but no SELECT policy, so querying it directly returned zero rows
 * with no error. v_applications_by_ad exposes counts grouped by ad id only -
 * no names, emails or phone numbers can leave through it.
 *
 * JOIN KEY, verified 2026-09-04 against live data:
 *   application_partials.utm_content  = meta_ad_daily.ad_id
 *   application_partials.utm_term     = adset_id   (NOT the ad)
 *   application_partials.utm_campaign = campaign_id
 *
 * Qualified = the top three revenue bands, a controlled dropdown.
 */
export async function getApplicationsByAd() {
  const empty = {
    configured: false,
    byAd: {} as Record<string, { leads: number; qualified: number }>,
    total_apps: 0, apps_with_ad: 0, ads_with_applications: 0,
  };
  if (!lovableConfigured()) return empty;

  const supabase = createLovableClient()!;

  const [{ data: perAd, error: adErr }, { data: cov }] = await Promise.all([
    supabase.from('v_applications_by_ad').select('ad_id, leads, qualified_leads'),
    supabase.from('v_application_coverage')
      .select('total_apps, apps_with_ad_id, ads_with_applications').maybeSingle(),
  ]);

  if (adErr) return { ...empty, configured: true, error: adErr.message };

  const byAd: Record<string, { leads: number; qualified: number }> = {};
  for (const r of (perAd ?? []) as any[]) {
    byAd[r.ad_id] = { leads: Number(r.leads ?? 0), qualified: Number(r.qualified_leads ?? 0) };
  }

  return {
    configured: true,
    byAd,
    total_apps: Number(cov?.total_apps ?? 0),
    apps_with_ad: Number(cov?.apps_with_ad_id ?? 0),
    ads_with_applications: Number(cov?.ads_with_applications ?? Object.keys(byAd).length),
  };
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
      ads_with_applications: apps.ads_with_applications,
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
