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

// What each reading says on each side. { id: [Bullish, Bearish, needsDefiLlama] }
const PHRASE = {
  Q1: (r) => [`raising a fee seems to raise revenue (${r.detail})`, `raising a fee seems to lower revenue (${r.detail})`, false],
  Q2: (r) => [`NEAR's share of fees is ${r.detail.replace(' last 30 days', '')} over the last 30 days`, `NEAR's share of fees has stayed under 20% for two weeks`, true],
  Q3: () => ['solvers keep little and no small group of them dominates', 'solvers keep a lot or a small group of them dominates', false],
  Q4: (r) => [`no single integrator dominates (${r.detail})`, `one integrator brings most of the fees (${r.detail})`, false],
  Q5: () => ['revenue has risen over each of the last three months', 'revenue has fallen over each of the last three months', true],
};

const list = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function thesisText(doc) {
  const { readings, verdict: v, vstar } = doc;
  const on = date(doc.asOf);
  const lean = v.verdict === 'Bullish' || v.verdict === 'Bearish';
  const live = [];

  // 1. The verdict.
  if (lean) live.push(`As of ${on}, the evidence leans ${v.verdict}${Math.abs(v.score) === 3 ? ', but only just' : ''}.`);
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
    if (used.some((x) => x.llama)) parts.push('The DefiLlama figures come from a dataset nobody can re-run for free.');
    live.push(parts.join(' '));
  }

  // 3. What is still unknown.
  const missing = readings.filter((r) => r.side === 'Not Measured').map((r) => r.name);
  const unknown = [];
  if (missing.length) unknown.push(`Not measured yet: ${list(missing)}.`);
  if (readings.find((r) => r.id === 'Q1')?.side === 'Neutral') unknown.push('Pricing Power is not settled: the data cannot yet say whether raising a fee helps or hurts revenue.');
  if (unknown.length) live.push(unknown.join(' '));

  // 4. Distance to the threshold (DefiLlama volume).
  if (vstar) {
    const x = (n) => `${n.toFixed(1)}x`;
    live.push(`Monthly volume would need to reach about ${x(vstar.multiple16)} today's level under the 1.6% issuance plan, which passed its vote but is not in force yet, or ${x(vstar.multiple25)} if issuance stays at 2.5%, with all revenue spent on buybacks.`);
  }
  return { asOf: doc.asOf.slice(0, 10), fixed: FIXED, live };
}
