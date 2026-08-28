import { Stat, Panel, Notice, Table, Th, Td, Empty, Badge, UnverifiedName } from '@/components/ui';
import { GrowthChart, AttributionBars } from '@/components/charts';
import { FlagButton } from '@/components/flag-button';
import { getRole, canSeeRepComp } from '@/lib/auth';
import {
  getActiveMembers, getLiveContractValue, getCashThisMonth, getNetNewThisMonth,
  getGrowthSeries, getRenewals, getRepLeaderboard, getAttribution,
} from '@/lib/queries';
import { eur, num, shortDate, daysBetween, displayName, nameUnverified, monthBounds } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CommandCentre() {
  const { role } = await getRole();
  const { start, end } = monthBounds();

  const [members, lcv, cash, netNew, growth, renewals, reps, attribution] = await Promise.all([
    getActiveMembers(), getLiveContractValue(), getCashThisMonth(), getNetNewThisMonth(),
    getGrowthSeries(), getRenewals(30), getRepLeaderboard(),
    getAttribution(start.slice(0, 10), end.slice(0, 10)),
  ]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net new this month" value={num(netNew)} sub="Terms starting this calendar month" />
        <Stat label="Active members" value={num(members.length)} sub="Live from v_active_members" />
        <Stat label="Live contract value" value={eur(lcv.live_contract_value_eur)} sub={`${num(lcv.live_terms)} live terms`} />
        <Stat label="Cash this month" value={eur(cash)} sub="Members Club Revenue, cash collected date" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Member growth" hint="Last 30 days">
          <GrowthChart data={growth} />
        </Panel>

        <Panel title="Renewals due in 30 days" hint={`${renewals.length} term${renewals.length === 1 ? '' : 's'}`}>
          {renewals.length === 0 ? (
            <Empty>Nothing due in the next 30 days.</Empty>
          ) : (
            <Table>
              <thead><tr>
                <Th>Member</Th><Th>Tier</Th><Th className="text-right">Amount</Th>
                <Th>Term end</Th><Th className="text-right">Days</Th><Th />
              </tr></thead>
              <tbody>
                {renewals.map((r) => {
                  const p = r.people;
                  const unverified = nameUnverified(p?.name_source, p?.full_name);
                  const left = daysBetween(r.extended_to ?? r.term_end);
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
                      <Td className="text-muted">{shortDate(r.extended_to ?? r.term_end)}</Td>
                      <Td className="tnum text-right">
                        <Badge tone={left != null && left <= 7 ? 'bad' : left != null && left <= 21 ? 'warn' : 'muted'}>
                          {left ?? '—'}
                        </Badge>
                      </Td>
                      <Td><FlagButton personId={r.person_id} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Source attribution" hint="Current month">
          <div className="mb-4">
            <Notice>
              UTM data from Whop is currently empty. {attribution.tagged} of {attribution.total} transactions this
              month carry a source — everything else counts as unknown.
            </Notice>
          </div>
          <AttributionBars data={attribution.rows} />
        </Panel>

        {canSeeRepComp(role) ? (
          <Panel title="Rep leaderboard" hint="Current month, by cash">
            {reps.rows.length === 0 ? (
              <Empty>No rep-attributed revenue this month.</Empty>
            ) : (
              <Table>
                <thead><tr>
                  <Th>Rep</Th><Th className="text-right">Closes</Th>
                  <Th className="text-right">Cash</Th><Th className="text-right">Avg deal</Th>
                </tr></thead>
                <tbody>
                  {reps.rows.map((r) => (
                    <tr key={r.rep} className="border-t border-edge">
                      <Td>{r.rep}</Td>
                      <Td className="tnum text-right">{num(r.closes)}</Td>
                      <Td className="tnum text-right">{eur(r.cash)}</Td>
                      <Td className="tnum text-right text-muted">{eur(r.avg)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <div className="mt-4">
              <Notice>
                Rep attribution is {Math.round((reps.coverage.withRep / Math.max(reps.coverage.total, 1)) * 1000) / 10}% complete
                ({num(reps.coverage.withRep)} of {num(reps.coverage.total)} transactions have a sales_rep).
                Treat this table as indicative, not as a compensation basis.
              </Notice>
            </div>
          </Panel>
        ) : (
          <Panel title="Rep leaderboard">
            <Empty>Visible to admins only.</Empty>
          </Panel>
        )}
      </div>
    </div>
  );
}
