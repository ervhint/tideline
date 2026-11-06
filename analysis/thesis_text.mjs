// The "What This Means" text (FR-15). Pure: the published thesis document in, sentences out. No network, no clock, no model.
// Every sentence is written in advance; the code only picks by verdict and reading and fills in figures from the document.
// It says nothing the readings do not say (docs/THESIS-TEXT-NOTES.md, PREREG.md section 7: no advice, no price claim).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n)}`;

export const FIXED = [
  'Tideline asks whether NEAR Intents fees could ever cover the new NEAR being issued. This is research, not financial advice.',
  'A Bullish reading means the evidence passed a line set in advance, not that the price will rise.',
];

// What each reading says on each side. { id: [Bullish, Bearish, needsDefiLlama, Neutral] }. A Neutral phrase is said only where the reading has its own numbers.
const PHRASE = {
  Q1: (r) => [`raising a fee seems to raise revenue (${r.detail})`, `raising a fee seems to lower revenue (${r.detail})`, false],
  Q2: (r) => [`NEAR's share of fees is ${r.detail.replace(' last 30 days', '')} over the last 30 days`, `NEAR's share of fees has stayed under 20% for two weeks`, true],
  Q3: (r) => [`solvers keep little and no small group of them dominates (${lower(r.detail)})`, `solvers keep a lot or a small group of them dominates (${lower(r.detail)})`, false, `solvers sit between the lines (${lower(r.detail)})`],
  Q4: (r) => [`no single integrator dominates (${r.detail})`, `one integrator brings most of the fees (${r.detail})`, false, `one integrator brings much of the fees but stays under the 80% line (${r.detail})`],
  Q5: () => ['revenue has risen over each of the last three months', 'revenue has fallen over each of the last three months', true],
};

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pct = (x) => `${Math.round(x * 100)}%`;

// A2 rule 4: what is still published on the public swaps of a reading over the private line. It sets nothing.
const SIDE_FIGURES = {
  Q3: ({ spreadBps, top3 }) => [spreadBps != null && `spread ${spreadBps.toFixed(1)} bps`, top3 != null && `top 3 solvers hold ${pct(top3)}`],
  Q4: ({ share, name }) => [share != null && `${name ? `${name} ` : ''}${pct(share)} of visible app fees`],
};
const sideFigures = (r) => SIDE_FIGURES[r.id](r.sideFigures).filter(Boolean);

export function thesisText(doc) {
  const { readings, verdict: v, vstar } = doc;
  const on = date(doc.asOf);
  const lean = v.verdict === 'Bullish' || v.verdict === 'Bearish';
  const live = [];

  // 1. The verdict.
  // A2 rule 5: a held score is published, and must not read as if it fell short of a line it may have reached.
  if (v.held?.length) live.push(`As of ${on}, the verdict is held at Undecided because flow went private. The score is ${signed(v.score)} of 7, but data lost to private flow may not move the verdict, so it stays Undecided until the treasury share falls back to 50% or less.`);
  else if (lean) live.push(`As of ${on}, the evidence leans ${v.verdict}${Math.abs(v.score) === 3 ? ', but only just' : ''}.`);
  else if (v.missing >= 3) live.push(`As of ${on}, too little is measured to lean either way.`);
  else live.push(`As of ${on}, the evidence does not reach either line (score ${signed(v.score)} of 7; the lines are +3 and -3).`);

  // 2. What it rests on.
  const says = (side) => readings.filter((r) => r.side === side).map((r) => ({ id: r.id, text: PHRASE[r.id](r)[side === 'Bullish' ? 0 : 1], llama: PHRASE[r.id](r)[2] }));
  const up = says('Bullish'), down = says('Bearish');
  const used = [...up, ...down];
  if (!used.length) live.push('No reading points either way yet.');
  else {
    const parts = [];
    if (up.length) parts.push(`${up.length === 1 && !down.length ? 'One reading points' : 'Pointing'} Bullish: ${list(up.map((x) => x.text))}.`);
    if (down.length) parts.push(`${down.length === 1 && !up.length ? 'One reading points' : 'Pointing'} Bearish: ${list(down.map((x) => x.text))}.`);
    const between = readings.filter((r) => r.side === 'Neutral' && PHRASE[r.id](r)[3]).map((r) => PHRASE[r.id](r)[3]);
    if (between.length) parts.push(`In between: ${list(between)}.`);
    if (used.some((x) => x.llama)) parts.push('The DefiLlama figures come from a dataset nobody can re-run for free.');
    live.push(parts.join(' '));
  }

  // 3. What is still unknown.
  const missing = readings.filter((r) => r.side === 'Not Measured' && !r.privateFlow).map((r) => `${r.name} (${lower(r.detail)})`);
  const gone = readings.filter((r) => r.privateFlow);
  const unknown = [];
  if (missing.length) unknown.push(`Not measured yet: ${list(missing)}.`);
  if (gone.length) unknown.push(`Not measured because flow went private: ${list(gone.map((r) => `${r.name} (${r.detail.replace('Flow went private: ', '')})`))}.`);
  const side = gone.flatMap(sideFigures);
  if (side.length) unknown.push(`On the public swaps left, as side figures that set no reading: ${list(side)}.`);
  if (readings.find((r) => r.id === 'Q1')?.side === 'Neutral') unknown.push('Pricing Power is not settled: the data cannot yet say whether raising a fee helps or hurts revenue.');
  if (unknown.length) live.push(unknown.join(' '));

  // 4. How much of the flow went private (PREREG A2). The confidential share is a side measure and sets no reading.
  const pf = doc.privateFlow;
  if (pf?.q3?.share != null) {
    const c = pf.confidential?.last7;
    live.push(`The Confidential Intents treasury, where funds move to a private chain and the swap settles out of public view, carried ${pct(pf.q3.share)} of the USD counted over the last ${pf.q3.days} frozen days${pf.q4?.share != null ? ` and ${pct(pf.q4.share)} over the last ${pf.q4.days}` : ''}.${c?.confidentialShare != null ? ` Other accounts' funds going into it were ${pct(c.confidentialShare)} of the flow we can see over ${c.daysRead} of the last ${c.days} days, a side measure that sets no reading.` : ''}`);
  }

  // 5. Distance to the threshold (DefiLlama volume).
  if (vstar) {
    const x = (n) => `${n.toFixed(1)}x`;
    live.push(`Monthly volume would need to reach about ${x(vstar.multiple16)} today's level under the 1.6% issuance plan, which passed its vote but is not in force yet, or ${x(vstar.multiple25)} if issuance stays at 2.5%, with all revenue spent on buybacks.`);
  }
  return { asOf: doc.asOf.slice(0, 10), fixed: FIXED, live };
}
