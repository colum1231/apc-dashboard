import { Panel, Table, Th, Td, Notice, Stat, Empty } from '@/components/ui';
import { getAttribution } from '@/lib/queries';
import { eur, num, pct, monthBounds } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AttributionPage({
  searchParams,
}: { searchParams: { from?: string; to?: string } }) {
  const { start, end } = monthBounds();
  const from = searchParams.from ?? start.slice(0, 10);
  const to = searchParams.to ?? end.slice(0, 10);

  const { rows, tagged, total } = await getAttribution(from, to);

  const totals = rows.reduce(
    (t, r) => ({
      applications: t.applications + r.applications,
      leads: t.leads + r.leads,
      closes: t.closes + r.closes,
      cash: t.cash + r.cash,
    }),
    { applications: 0, leads: 0, closes: 0, cash: 0 }
  );

  return (
    <div className="space-y-5">
      <Notice>
        Whop UTM capture is not active. Attribution reflects manually tagged records only —
        {' '}{num(tagged)} of {num(total)} transactions in this range carry a source. Fix at checkout to enable full funnel tracking.
      </Notice>

      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={from}
                 className="ml-2 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent" />
        </label>
        <label className="text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={to}
                 className="ml-2 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent" />
        </label>
        <button className="rounded-md border border-edge px-3 py-1.5 text-xs hover:border-accent hover:text-accent">Apply</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Applications" value={num(totals.applications)} />
        <Stat label="Leads" value={num(totals.leads)} sub={`${pct(totals.leads, totals.applications)} of applications`} />
        <Stat label="Closes" value={num(totals.closes)} sub={`${pct(totals.closes, totals.leads)} of leads`} />
        <Stat label="Cash" value={eur(totals.cash)} sub={`${eur(totals.closes ? totals.cash / totals.closes : 0)} avg`} />
      </div>

      <Panel title="By channel" hint="Derived from utm_source and utm_medium">
        {rows.every((r) => r.closes === 0) ? (
          <Empty>No transactions in this date range.</Empty>
        ) : (
          <Table>
            <thead><tr>
              <Th>Channel</Th><Th className="text-right">Applications</Th><Th className="text-right">Leads</Th>
              <Th className="text-right">Closes</Th><Th className="text-right">Cash</Th>
              <Th className="text-right">Close rate</Th><Th className="text-right">Avg deal</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.channel} className="border-t border-edge">
                  <Td className="capitalize">{r.channel}</Td>
                  <Td className="tnum text-right">{num(r.applications)}</Td>
                  <Td className="tnum text-right">{num(r.leads)}</Td>
                  <Td className="tnum text-right">{num(r.closes)}</Td>
                  <Td className="tnum text-right">{eur(r.cash)}</Td>
                  <Td className="tnum text-right text-muted">{pct(r.closes, r.leads)}</Td>
                  <Td className="tnum text-right text-muted">{eur(r.closes ? r.cash / r.closes : 0)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Notice tone="accent">
        Applications and leads are currently inferred from paid transactions, so the funnel
        stages above will read identically until an application source is wired in.
      </Notice>
    </div>
  );
}
