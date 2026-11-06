import { Page } from '@/components/Page';
import { ReadingCell } from '@/components/ReadingCell';
import { Table } from '@/components/Table';
import { getNumbers } from '@/lib/data';

// Lines are from PREREG.md section 6 (frozen 2026-11-01); the plain wording around them is the agent's.
const moves = [
  ['The whole elasticity interval sits above -1: raising fees raises revenue.', 'The whole interval sits below -1: raising fees lowers revenue.'],
  ["NEAR's share of fees (DefiLlama revenue over fees) is above 30% over the last 30 days.", 'The share has been under 20% on each of the last 14 days.'],
  ['Solvers keep under 5 bps on $1k to $10k swaps and the top 3 solvers hold under 60%.', 'Solvers keep over 10 bps, or the top 3 hold over 80%.'],
  ['The largest frontend brings under 50% of the last 30 days of fees.', 'The largest frontend brings over 80% of those fees.'],
  ['The 90-day revenue total rose at each of the last three month-ends.', 'The 90-day revenue total fell at each of the last three month-ends.'],
];

export const revalidate = 300; // re-read the published data every 5 minutes

export default async function WhatWouldMove() {
  const { readings } = await getNumbers();
  return (
    <Page title="What Would Move Each Reading" lead="The condition that would move each of the five readings toward Bullish or Bearish. The lines come from the frozen pre-registration.">
      <div className="glass stack stack-top">
        <Table
          head={['Reading', 'Moves Toward Bullish When', 'Moves Toward Bearish When']}
          widths={[220, 480, 480]}
          rows={readings.map((r, i) => [
            <ReadingCell key={r.name} {...r} />,
            <span className="big" key="b">{moves[i][0]}</span>,
            <span className="big" key="r">{moves[i][1]}</span>,
          ])}
        />
        <p className="s-text">Anything between the two lines reads Neutral, and exactly on a line counts as Neutral. Missing data reads Not Measured. Two lines (Q2 and Q4) were set after the current figures were seen; PREREG.md section 1 says so. Solver Competition reads Not Measured when the Confidential Intents treasury carries over 50% of its last 7 frozen days, and Largest Integrator when it carries over 50% of its last 30. While either is Not Measured for that reason, the verdict stays Undecided whatever the score, so a loss of data cannot move it (PREREG.md amendment A2).</p>
      </div>
    </Page>
  );
}
