import { Page } from '@/components/Page';
import { Table } from '@/components/Table';
import { getChainChecks, getReconciliation, getTokenBoard } from '@/lib/data';
import { reconcileRows, type Row } from '@/lib/reconcile_view';
import { Banner } from '@/components/Banner';

const sources = [
  ['DefiLlama', 'Volume, fees and revenue for the last 30 days, and hourly token prices. No key.'],
  ['FastNEAR', 'intents.near settlement logs: every transaction that names a known solver or the hub, read in full for each day, not sampled. Swaps, frontend, fees and solver come from these. No key.'],
  ['NEAR RPC', 'Token supply, token decimals and names, and the testnet contract that anchors each frozen day. No key.'],
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
  const checks = await getChainChecks();
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
          <p className="p-body">It is not blind: an earlier private estimate by the same author was seen first, and the pre-registration says so on its first line.</p>
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
        {checks ? (
          <>
            <p className="p-body">{checks.summary}</p>
            <Table
              head={['Day', 'Transactions Listed', 'Read', 'Swaps', 'Unpriced Swaps', 'What Differs']}
              widths={[160, 170, 140, 140, 150, 400]}
              rows={checks.rows}
            />
            <p className="s-text">Each frozen day lists every intents.near transaction that names a known solver or the hub, then reads each one. A day freezes only when at least 99% of the list was read; otherwise it stays a gap. Its file hash is anchored on NEAR testnet (Reproduce). A re-run from scratch reads the same transactions and swaps, but not always the same hash: DefiLlama can later give slightly different hourly prices for small tokens, which moved USD by at most 0.0012% when three days were frozen twice.</p>
          </>
        ) : (
          <Banner tone="error" title="Could Not Load the Chain Checks">The file with the frozen days could not be read, so this table is not shown.</Banner>
        )}
      </div>
      <div className="glass stack stack-top">
        <p className="s-title">Which Swaps the Costs Cover</p>
        {board ? (
          <>
            <p className="p-body">{board.summary}</p>
            <Table head={['Largest Routes', 'Volume', 'Share', 'Priced']} widths={[420, 200, 160, 300]} rows={board.rows} />
            <p className="s-text">The biggest routes priced on one side only: {board.missing}. The fee figures on Follow the Fee hold for routes priced on both sides; other routes can cost more or less. Volume is the priced side, so routes with no price at all show none.</p>
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
