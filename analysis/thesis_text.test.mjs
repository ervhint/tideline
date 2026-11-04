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
  assert.match(t, /Not measured yet: Solver Competition\./);
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
  assert.match(t, /Not measured yet: Pricing Power, NEAR's Share of Fees and Solver Competition\./);
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
