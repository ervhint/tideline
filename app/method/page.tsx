import { Page } from '@/components/Page';
import { Table } from '@/components/Table';
import { getReconciliation, getSpotChecks, getTokenBoard } from '@/lib/data';
import { reconcileRows, type Row } from '@/lib/reconcile_view';
import { Banner } from '@/components/Banner';

const sources = [
  ['DefiLlama', 'Volume, fees and revenue for the last 30 days.'],
  ['FastNEAR', 'intents.near settlement logs: swaps, frontend, fees and solver, from a seeded daily sample. No key.'],
  ['NEAR RPC', 'Token supply, token names, and spot checks on sampled days.'],
];
// Each row: our figure, then every other source with its value and the date it gave, then why they differ.
const others = (os: Row['others']) =>
  os.map((o) => (
    <span key={o.name} style={{ display: 'block' }}>
      {o.url ? <a href={o.url}>{o.name}</a> : o.name}: {o.value}
      <span style={{ display: 'block' }}>{o.date}</span>
    </span>
  ));

export const revalidate = 300; // re-read the published data every 5 minutes

// `?state=error` previews the page with the published file unreadable: the same path a real failed read takes.
export default async function Method({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const preview = (await searchParams).state === 'error';
  const rows = preview ? reconcileRows({ vstar: null, buybackShare: null, fees: [], volume: [] }) : await getReconciliation();
  const failed = rows.every((r) => r.ours === 'Not available');
  const differ = rows.map((r) => [r.figure, r.ours, others(r.others), r.why]);
  const spot = await getSpotChecks();
  const board = await getTokenBoard();
  return (
    <Page title="How the Numbers Are Made" lead="Where each number comes from, what was decided before looking, and where public figures disagree.">
      <div className="panel-row two">
        <div className="glass stack">
          <p className="s-title">Where the Numbers Come From</p>
          {sources.map(([n, t]) => (
            <div key={n}>
              <p className="src-name">{n}</p>
              <p className="src-text">{t}</p>
            </div>
          ))}
        </div>
        <div className="glass stack">
          <p className="s-title">Decided Before Looking</p>
          <p className="p-body">The list of fee changes and the level for each reading are written down in the pre-registration before volume is looked at. If the list changes later, the change is shown on the page.</p>
          <p className="p-body">Every number worked out from our saved data re-runs with npm run verify. Source data such as price and supply is used as given.</p>
        </div>
      </div>
      <div className="glass stack stack-top">
        <p className="s-title">Where Public Figures Disagree</p>
        {failed && (
          <Banner tone="error" title="Could Not Load Our Figures">
            The published file with our side of these figures could not be read, so every Ours cell says Not available. The other sources are still shown.
          </Banner>
        )}
        <Table head={['Figure', 'Ours', 'Other Source', 'Why They Differ']} widths={[260, 200, 300, 420]} rows={differ} />
      </div>
      <div className="glass stack stack-top">
        <p className="s-title">Checked Against the Chain</p>
        {spot ? (
          <>
            <Table
              head={['Day', 'Swaps Checked', 'Match on Both Chains', 'Match on NEAR Only', 'Do Not Match', 'What Differs']}
              widths={[160, 140, 170, 170, 140, 400]}
              rows={spot.rows.map((r) => [r.day, String(r.checked), String(r.match), String(r.nearOnly), String(r.mismatch), r.why.length ? `${r.why.join('; ')}. Largest USD gap $${r.gap.toFixed(2)}.` : `Nothing. Largest USD gap $${r.gap.toFixed(2)}.`])}
            />
            <p className="s-text">{spot.scope}. Each Explorer swap is looked up on NEAR, and on Ethereum when the Explorer gives a hash, and its amount compared.</p>
          </>
        ) : (
          <Banner tone="error" title="Could Not Load the Spot Checks">The spot check file could not be read, so this table is not shown.</Banner>
        )}
      </div>
      <div className="glass stack stack-top">
        <p className="s-title">Which Swaps Our Quotes Cover</p>
        {board ? (
          <>
            <p className="p-body">{board.summary}</p>
            <Table head={['Largest Routes', 'Volume', 'Share', 'Our Quotes']} widths={[420, 200, 160, 300]} rows={board.rows} />
            <p className="s-text">The biggest routes we do not quote: {board.missing}. The fee figures on Follow the Fee hold for the quoted routes; other routes can cost more or less. Explorer, 1Click only.</p>
          </>
        ) : (
          <Banner tone="error" title="Could Not Load the Coverage Board">The coverage board file could not be read, so this table is not shown.</Banner>
        )}
      </div>
      <div className="glass stack stack-top">
        <p className="s-title">More on This Site</p>
        <div className="more-row">
          <a href="/concentration/">Who Brings the Volume?</a>
          <a href="/what-would-move/">What Would Move Each Reading</a>
        </div>
      </div>
    </Page>
  );
}
