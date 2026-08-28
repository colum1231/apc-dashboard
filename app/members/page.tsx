import { createClient } from '@/lib/supabase/server';
import { MembersTable } from '@/components/members-table';
import { getActiveMembers } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const supabase = createClient();
  const members = await getActiveMembers();
  const ids = members.map((m) => m.person_id);

  const [{ data: people }, { data: terms }] = await Promise.all([
    supabase.from('people').select('person_id, primary_email, full_name, name_source, status').in('person_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('membership_terms').select('person_id, tier, term_start, term_end, extended_to, amount_eur, status')
      .in('person_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).eq('status', 'active'),
  ]);

  const peopleById = Object.fromEntries((people ?? []).map((p: any) => [p.person_id, p]));
  const termByPerson: Record<string, any> = {};
  (terms ?? []).forEach((t: any) => {
    const cur = termByPerson[t.person_id];
    const d = t.extended_to ?? t.term_end;
    if (!cur || d < (cur.extended_to ?? cur.term_end)) termByPerson[t.person_id] = t;
  });

  const rows = members.map((m) => {
    const p = peopleById[m.person_id] ?? {};
    const t = termByPerson[m.person_id] ?? {};
    return {
      person_id: m.person_id,
      email: m.primary_email,
      full_name: p.full_name ?? m.full_name ?? null,
      name_source: p.name_source ?? null,
      tier: t.tier ?? null,
      term_start: t.term_start ?? null,
      term_end: t.extended_to ?? t.term_end ?? m.next_renewal_due ?? null,
      amount_eur: t.amount_eur ?? null,
      status: p.status ?? 'active',
    };
  });

  return <MembersTable rows={rows} />;
}
