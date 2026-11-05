import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thesisView } from './thesis_view.ts';

const sample = { asOf: '30 Oct 2026', today: 3.89e9, multiple: '3.5×', price: '$4.34', verdict: 'Undecided', thresholds: [{ at: 1, note: 'a' }, { at: 2, note: 'b' }] };
const sampleReadings = [{ name: 'Pricing Power', detail: 'Still to estimate', status: 'Not Measured' }];
const reading = (id, name, side) => ({ id, name, side, detail: `${name} detail`, plain: '', source: '', query: '' });
const doc = {
  asOf: '2026-11-01T10:33:58.902Z',
  readings: [reading('Q1', 'Pricing Power', 'Neutral'), reading('Q2', "NEAR's Share of Fees", 'Bullish'), reading('Q3', 'Solver Competition', 'Not Measured'), reading('Q4', 'Largest Integrator', 'Neutral'), reading('Q5', 'Path to Deflation', 'Bullish')],
  verdict: { verdict: 'Bullish', score: 3, missing: 1 },
  vstar: { todayUsd: 3.86e9, priceUsd: 4.41, at16: { low: 13.5e9, mid: 13.7e9, high: 57.3e9 }, at25: { low: 20e9, mid: 21.6e9, high: 90e9 }, multiple16: 3.55 },
};

test('T-6.3 S1 view: five readings, the verdict and the V* band come from the file', () => {
  const v = thesisView(doc, sample, sampleReadings);
  assert.equal(v.live, true);
  assert.equal(v.readings.length, 5);
  assert.equal(v.readings[1].status, 'Bullish');
  assert.equal(v.sample.verdict, 'Bullish');
  assert.equal(v.sample.multiple, '3.5×');
  assert.equal(v.sample.price, '$4.41');
  assert.equal(v.sample.asOf, '1 Nov 2026');
  assert.deepEqual(v.sample.thresholds.map((t) => t.at), [13.7e9, 21.6e9]);
  assert.match(v.verdictText, /Score \+3 of 7/);
});

test('T-6.3 S1 view: 3 or more Not Measured says the verdict stays open', () => {
  const v = thesisView({ ...doc, verdict: { verdict: 'Undecided', score: 0, missing: 3 } }, sample, sampleReadings);
  assert.match(v.verdictText, /3 of five readings are not measured/);
});

test('T-6.3 S1 view: without the file the sample figures stay', () => {
  const v = thesisView(null, sample, sampleReadings);
  assert.equal(v.live, false);
  assert.equal(v.sample.verdict, 'Undecided');
  assert.equal(v.readings.length, 1);
});

import { concentrationView } from './thesis_view.ts';

test('concentrationView fills the integrator column and keeps solver columns Not Measured', () => {
  const v = concentrationView({ concentration: { window: '30 days to 2026-10-29', source: 's', bySize: { '0-1k': { name: 'SwapKit', share: 0.74 }, '1k-10k': null } } }, '71%');
  assert.equal(v.live, true);
  assert.deepEqual(v.rows[0], ['$0 to $1k', 'SwapKit 74%', 'Not Measured', 'Not Measured']);
  assert.deepEqual(v.rows[1], ['$1k to $10k', 'Not Measured', 'Not Measured', 'Not Measured']);
  assert.equal(v.rows.length, 4);
});

test('concentrationView notes: where the solver range sits against the lines, and what the integrator share covers', () => {
  const v = concentrationView({ concentration: {
    window: 'w', source: 's', bySize: {}, tokenDiffShareOfUsd: 0.84, feeUnreadable: { usd: 2.276e8 },
    largest: { name: 'SwapKit', share: 0.7555, shareOfNamed: 0.7934 },
    solvers: { days: ['a', 'b'], bySize: {}, allSizes: { top3: 0.77 }, tokenDiffOnly: { top3: 0.67 },
      stability: { perDayTop3: [{ top3: 0.74 }, { top3: 0.81 }], leaveOneDayOut: { min: 0.76, max: 0.78 } } },
  } }, null);
  assert.match(v.solverNote, /top 3 solvers fill 77% over these days\. Single days range from 74% to 81%, and leaving out any one day gives 76% to 78%, all between the 60% and 80% lines/);
  assert.match(v.solverNote, /Counting token_diff swaps only, the top 3 fill 67%\.$/);
  assert.match(v.integratorNote, /they are 84% of the USD/);
  assert.match(v.integratorNote, /SwapKit pays 76% of the app fees seen; with unnamed and blank referrals left out it is 79%\. .*\(\$228M\)/);
});

test('concentrationView with no file says Not Measured everywhere', () => {
  const v = concentrationView(null, null);
  assert.equal(v.live, false);
  assert.ok(v.rows.every((r) => r.slice(1).every((c) => c === 'Not Measured')));
});

test('thesisView passes the stored text through, and has none when the file is missing', () => {
  const text = { asOf: '2026-11-01', fixed: ['f'], live: ['l'] };
  assert.deepEqual(thesisView({ ...doc, text }, sample, sampleReadings).text, text);
  assert.equal(thesisView(doc, sample, sampleReadings).text, null);
  assert.equal(thesisView(null, sample, sampleReadings).text, null);
});
