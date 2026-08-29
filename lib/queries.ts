import { createClient } from '@/lib/supabase/server';
import { monthBounds, isoDaysFromNow } from '@/lib/format';

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
