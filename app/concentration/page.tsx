import { Page } from '@/components/Page';
import { Table } from '@/components/Table';
import { getConcentration } from '@/lib/data';

export const revalidate = 300; // re-read the published data every 5 minutes

export default async function Concentration() {
  const c = await getConcentration();
  return (
    <Page title="Who Brings the Volume?" lead={`Share from the largest integrator and the largest solvers, by swap size. ${c.solverDays ? "Both are read from our data." : "The integrator column is read from our data; the solver columns are not measured yet."}`}>
      <div className="conc">
        <div className="glass stack">
          <p className="s-title">Concentration by Swap Size</p>
          <Table
            head={['Swap Size', 'Largest Integrator', 'Top-3 Solver Share', 'HHI']}
            widths={[200, 190, 190, 150]}
            rows={c.rows}
          />
          <p className="s-text">Largest Integrator is its share of the app fees paid on token_diff swaps, {c.window ?? "window not available"}. {c.solverDays ? `Solver columns: every public swap of the last ${c.solverDays.length} frozen days (${c.solverDays[0]} to ${c.solverDays.at(-1)}), USD per filler account read from each swap's NEAR transaction.` : 'The solver columns appear once solver data is read from the frozen days.'} HHI is the sum of squared shares: 10,000 means one solver has everything.</p>
          {c.integratorNote && <p className="s-text">{c.integratorNote}</p>}
          {c.solverNote && <p className="s-text">{c.solverNote}</p>}
          <a className="s-query" href="/reproduce/">Open the Query</a>
        </div>
        <div className="numcard">
          <div className="share" role="img" aria-label="77% reported, not confirmed by our data">
            <p className="abs strong" style={{ top: 0 }}>77% Reported</p>
            <p className="abs small" style={{ top: 26 }}>Not confirmed by our data</p>
            <span className="abs trk" />
            <span className="abs dash" style={{ width: '77%' }} />
            {[[0, '0%'], [50, '50%'], [100, '100%']].map(([at, t]) => (
              <span key={t}>
                <span className="abs st" style={{ left: `calc(${at}% - ${at === 100 ? 1 : 0}px)` }} />
                <span className="abs small sl" style={{ left: `${at}%`, transform: `translateX(-${at}%)` }}>{t}</span>
              </span>
            ))}
          </div>
          <p className="n-text">Largest Integrator, All Sizes. A public source reports this figure. {c.ours ? `Our data reads: ${c.ours}. The public figure may measure something else, so the two need not match.` : "Our data is not available."}</p>
          <a className="n-link" href="/reproduce/">Open the Query</a>
        </div>
      </div>
    </Page>
  );
}
