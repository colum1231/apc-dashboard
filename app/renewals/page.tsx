import { Panel, Table, Th, Td, Badge, UnverifiedName, Empty } from '@/components/ui';
import { PipelineStatus } from '@/components/pipeline-status';
import { createClient } from '@/lib/supabase/server';
import { getRenewals, getLapsedRenewable } from '@/lib/queries';
import { getRole, canEditPipeline } from '@/lib/auth';
import { eur, shortDate, daysBetween, displayName, nameUnverified } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function RenewalsPage() {
  const { role } = await getRole();
  const supabase = createClient();

  const [due, lapsed, { data: pipeline }] = await Promise.all([
    getRenewals(90),
    getLapsedRenewable(),
    supabase.from('renewal_pipeline').select('term_id, status, last_contact_date'),
  ]);

  const byTerm = Object.fromEntries((pipeline ?? []).map((p: any) => [p.term_id, p]));

  return (
    <div className="space-y-5">
      <Section
        title="Due in 90 days"
        hint={`${due.length} term${due.length === 1 ? '' : 's'}`}
        rows={due}
        byTerm={byTerm}
        editable={canEditPipeline(role)}
        emptyText="Nothing renewing in the next 90 days."
      />
      <Section
        title="Lapsed renewable"
        hint={`${lapsed.length} term${lapsed.length === 1 ? '' : 's'}`}
        rows={lapsed}
        byTerm={byTerm}
        editable={canEditPipeline(role)}
        overdue
        emptyText="No lapsed renewable terms."
      />
    </div>
  );
}

function Section({ title, hint, rows, byTerm, editable, overdue, emptyText }: {
  title: string; hint: string; rows: any[]; byTerm: Record<string, any>;
  editable: boolean; overdue?: boolean; emptyText: string;
}) {
  return (
    <Panel title={title} hint={hint}>
      {rows.length === 0 ? <Empty>{emptyText}</Empty> : (
        <Table>
          <thead><tr>
            <Th>Member</Th><Th>Tier</Th><Th className="text-right">Amount</Th>
            <Th>Term end</Th><Th className="text-right">{overdue ? 'Days overdue' : 'Days left'}</Th>
            <Th>Last contact</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const p = r.people;
              const unverified = nameUnverified(p?.name_source, p?.full_name);
              const end = r.extended_to ?? r.term_end;
              const d = daysBetween(end);
              const shown = overdue ? (d == null ? null : -d) : d;
              const pl = byTerm[r.id];
              return (
                <tr key={r.id} className="border-t border-edge">
                  <Td>
                    <span className="flex items-center gap-1.5">
                      {unverified && <UnverifiedName />}
                      {displayName(p?.full_name, p?.primary_email ?? '—')}
                    </span>
                  </Td>
                  <Td className="text-muted">{r.tier ?? '—'}</Td>
                  <Td className="tnum text-right">{eur(r.amount_eur)}</Td>
                  <Td className="text-muted">{shortDate(end)}</Td>
                  <Td className="tnum text-right">
                    <Badge tone={overdue ? 'bad' : shown != null && shown <= 30 ? 'warn' : 'muted'}>{shown ?? '—'}</Badge>
                  </Td>
                  <Td className="text-muted">{shortDate(pl?.last_contact_date)}</Td>
                  <Td>
                    <PipelineStatus
                      termId={r.id}
                      personId={r.person_id}
                      initial={pl?.status ?? 'not contacted'}
                      disabled={!editable}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
