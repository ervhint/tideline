import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED, thesisText } from './thesis_text.mjs';
import { verdict } from './readings.mjs';

const R = (id, name, side, detail = `${name} detail`, extra = {}) => ({ id, name, side, detail, ...extra });
const names = ['Pricing Power', "NEAR's Share of Fees", 'Solver Competition', 'Largest Integrator', 'Path to Deflation'];
// sides: one per reading in Q1..Q5 order; the verdict is computed the way build_thesis does it.
const doc = (sides, asOf = '2026-11-01T10:33:58.902Z') => ({
  asOf,
  readings: sides.map((s, i) => R(`Q${i + 1}`, names[i], s, i === 1 ? '35% last 30 days' : undefined)),
  verdict: verdict(sides),
  vstar: { multiple16: 3.55, multiple25: 5.59 },
});
const text = (sides) => thesisText(doc(sides)).live.join('\n');

test('today: Bullish, only just, with both resting readings, the unknown one, and the threshold', () => {
  const t = text(['Neutral', 'Bullish', 'Not Measured', 'Neutral', 'Bullish']);
  assert.match(t, /^As of 1 Nov, the evidence leans Bullish, but only just\./);
  assert.match(t, /35% over the last 30 days and revenue has risen/);
  assert.match(t, /DefiLlama figures come from a dataset nobody can re-run/);
  assert.match(t, /Not measured yet: Solver Competition \(solver Competition detail\)\./);
  assert.match(t, /In between: one integrator brings much of the fees but stays under the 80% line \(Largest Integrator detail\)\./);
  assert.match(t, /Pricing Power is not settled/);
  assert.match(t, /about 3\.5x today's level under the 1\.6% issuance plan, which passed its vote but is not in force yet, or 5\.6x/);
});

test('a score above the line drops "only just"', () => {
  const t = text(['Bullish', 'Bullish', 'Bullish', 'Neutral', 'Bullish']);
  assert.match(t, /leans Bullish\./);
  assert.doesNotMatch(t, /only just/);
});

test('Bearish side uses the Bearish sentences and no Bullish ones', () => {
  const t = text(['Bearish', 'Bearish', 'Neutral', 'Neutral', 'Bearish']);
  assert.match(t, /leans Bearish/);
  assert.match(t, /Pointing Bearish: raising a fee seems to lower revenue/);
  assert.doesNotMatch(t, /Pointing Bullish/);
});

test('Undecided with no line passed says so and shows the score', () => {
  const t = text(['Neutral', 'Bullish', 'Neutral', 'Neutral', 'Neutral']);
  assert.match(t, /does not reach either line \(score \+1 of 7/);
  assert.match(t, /One reading points Bullish: NEAR's share of fees/);
});

test('three or more Not Measured is "too little is measured"', () => {
  const t = text(['Not Measured', 'Not Measured', 'Not Measured', 'Neutral', 'Bullish']);
  assert.match(t, /too little is measured to lean either way/);
  assert.match(t, /Not measured yet: Pricing Power \(pricing Power detail\), NEAR's Share of Fees \(35% last 30 days\) and Solver Competition \(solver Competition detail\)\./);
});

test('no reading on either side gives a plain sentence and no DefiLlama note', () => {
  const t = text(['Neutral', 'Neutral', 'Neutral', 'Neutral', 'Neutral']);
  assert.match(t, /No reading points either way yet\./);
  assert.doesNotMatch(t, /DefiLlama/);
});

test('nothing unknown drops that sentence', () => {
  const t = text(['Bullish', 'Bullish', 'Bullish', 'Bullish', 'Bullish']);
  assert.doesNotMatch(t, /Not measured|not settled/);
});

test('the date comes from the document, the fixed part carries the advice line, and the result is deterministic', () => {
  const a = thesisText(doc(['Neutral', 'Bullish', 'Neutral', 'Neutral', 'Bullish'], '2026-12-09T00:00:00Z'));
  assert.match(a.live[0], /^As of 9 Dec/);
  assert.equal(a.fixed, FIXED);
  assert.match(FIXED[0], /not financial advice/);
  assert.deepEqual(a, thesisText(doc(['Neutral', 'Bullish', 'Neutral', 'Neutral', 'Bullish'], '2026-12-09T00:00:00Z')));
});

test('no live sentence promises a price move or tells anyone to buy or sell (the fixed disclaimer may say the price will not be promised)', () => {
  for (const sides of [['Bullish', 'Bullish', 'Bullish', 'Bullish', 'Bullish'], ['Bearish', 'Bearish', 'Bearish', 'Bearish', 'Bearish']]) {
    const t = thesisText(doc(sides)).live.join(' ');
    assert.doesNotMatch(t, /\b(buy|sell|will rise|will fall|guarantee)\b/i);
  }
});

test('without a V* block the threshold sentence is left out', () => {
  const d = doc(['Neutral', 'Bullish', 'Neutral', 'Neutral', 'Bullish']);
  delete d.vstar;
  assert.ok(!thesisText(d).live.join(' ').includes('Monthly volume'));
});

const heldDoc = (o = {}) => {
  const sides = ['Not Measured', 'Bullish', 'Not Measured', 'Neutral', 'Bullish'];
  const d = doc(sides);
  d.readings[2] = R('Q3', names[2], 'Not Measured', 'Flow went private: treasury 64% of USD', { privateFlow: true, sideFigures: { spreadBps: 10.38, top3: 0.647 } });
  d.verdict = verdict(sides, ['Q3']);
  d.privateFlow = { line: 0.5, q3: { days: 7, share: 0.636 }, q4: { days: 30, share: 0.19 }, confidential: null };
  return { ...d, ...o };
};

test('A2 rule 5: a held verdict gives the reason and the score, and does not say the score fell short of a line', () => {
  const t = thesisText(heldDoc()).live.join('\n');
  assert.match(t, /^As of 1 Nov, the verdict is held at Undecided because flow went private. The score is \+3 of 7/);
  assert.match(t, /until the treasury share falls back to 50% or less/);
  assert.doesNotMatch(t, /does not reach either line/);
  assert.doesNotMatch(t, /leans/);
});

test('A2 rule 4: a reading gone private is named apart from a reading not measured yet, with its side figures', () => {
  const t = thesisText(heldDoc()).live.join('\n');
  assert.match(t, /Not measured yet: Pricing Power/);
  assert.doesNotMatch(t, /Not measured yet:[^.]*Solver Competition/);
  assert.match(t, /Not measured because flow went private: Solver Competition \(treasury 64% of USD\)\./);
  assert.match(t, /as side figures that set no reading: spread 10\.4 bps and top 3 solvers hold 65%\./);
});

test('A2 rule 4: Q4 gone private keeps its share as a side figure; a missing figure is not invented', () => {
  const d = heldDoc();
  d.readings[3] = R('Q4', names[3], 'Not Measured', 'Flow went private: treasury 55% of USD', { privateFlow: true, sideFigures: { share: 0.75, name: 'SwapKit' } });
  d.readings[2].sideFigures = { spreadBps: null, top3: 0.647 };
  const t = thesisText(d).live.join('\n');
  assert.match(t, /top 3 solvers hold 65% and SwapKit 75% of visible app fees\./);
  assert.doesNotMatch(t, /spread/);
});

test('A2: the treasury share is stated, and the confidential share only once it has been read', () => {
  assert.match(thesisText(heldDoc()).live.join('\n'), /carried 64% of the USD counted over the last 7 frozen days and 19% over the last 30\./);
  assert.doesNotMatch(thesisText(heldDoc()).live.join('\n'), /side measure/);
  const d = heldDoc();
  d.privateFlow.confidential = { last7: { days: 7, daysRead: 6, confidentialShare: 0.8 } };
  assert.match(thesisText(d).live.join('\n'), /Other accounts' funds going into it were 80% of the flow we can see over 6 of the last 7 days, a side measure that sets no reading\./);
});

test('with no private flow data the text stays as it was', () => {
  const t = text(['Neutral', 'Bullish', 'Not Measured', 'Neutral', 'Bullish']);
  assert.doesNotMatch(t, /Confidential Intents|flow went private/);
});
