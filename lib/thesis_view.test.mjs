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
  assert.match(v.solverNote, /top 3 solvers fill 77% of public USD over these days\. Single days range from 74% to 81%, and leaving out any one day gives 76% to 78%, all between the 60% and 80% lines/);
  assert.match(v.solverNote, /Counting token_diff swaps only, the top 3 fill 67%\.$/);
  assert.match(v.solverNote, /treasury 51e8f94d… is left out: it is a bridge to a private chain, not a solver/);
  assert.doesNotMatch(v.solverNote + v.integratorNote, /\bhub\b/);
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

const held = { ...doc, verdict: { verdict: 'Undecided', score: 3, missing: 2, held: ['Q3'] }, privateFlow: { line: 0.5, q3: { days: 7, share: 0.636 }, q4: { days: 30, share: 0.19 }, confidential: null } };

test('A2 rule 5: the Headline gives the hold reason and the score', () => {
  const v = thesisView(held, sample, sampleReadings);
  assert.equal(v.sample.verdict, 'Undecided');
  assert.equal(v.verdictText, 'Held at Undecided: flow went private, so Solver Competition reads Not Measured. Score +3 of 7, but lost data may not move the verdict.');
  const two = thesisView({ ...held, verdict: { ...held.verdict, held: ['Q3', 'Q4'] } }, sample, sampleReadings);
  assert.match(two.verdictText, /so Solver Competition and Largest Integrator read Not Measured/);
});

test('A2: the Headline line has the treasury share, and the confidential share once it is read', () => {
  assert.equal(thesisView(held, sample, sampleReadings).privateLine, 'The Confidential Intents treasury carried 64% of counted USD over the last 7 frozen days. Confidential share Not Measured until the treasury days are read.');
  const read = { ...held, privateFlow: { ...held.privateFlow, confidential: { last7: { days: 7, daysRead: 6, confidentialShare: 0.812 } } } };
  assert.match(thesisView(read, sample, sampleReadings).privateLine, /Confidential share 81% \(6 of 7 days read\)\.$/);
  assert.equal(thesisView(doc, sample, sampleReadings).privateLine, null);
  assert.equal(thesisView(null, sample, sampleReadings).privateLine, null);
});

test('A2 rule 4: Concentration marks figures as side figures only for the window over the line', () => {
  const concentration = { window: 'w', source: 's', bySize: {}, tokenDiffShareOfUsd: 0.8, feeUnreadable: { usd: 1e6 }, largest: { name: 'SwapKit', share: 0.75, shareOfNamed: 0.79 },
    solvers: { days: ['a'], bySize: {}, allSizes: { top3: 0.65 }, tokenDiffOnly: { top3: 0.66 }, stability: { perDayTop3: [{ top3: 0.6 }], leaveOneDayOut: { min: 0.6, max: 0.7 } } } };
  const v = concentrationView({ concentration, privateFlow: held.privateFlow }, null);
  assert.match(v.solverNote, /The treasury carried 64% of USD over these days, so these are side figures that set no reading\.$/);
  assert.doesNotMatch(v.integratorNote, /side figure/);
  const both = concentrationView({ concentration, privateFlow: { ...held.privateFlow, q4: { days: 30, share: 0.51 } } }, null);
  assert.match(both.integratorNote, /The treasury carried 51% of USD over these days, so this is a side figure that sets no reading\.$/);
  const empty = { ...concentration, solvers: { ...concentration.solvers, stability: { perDayTop3: [{ top3: null }, { top3: 0.6 }, { top3: 0.7 }], leaveOneDayOut: { min: 0.6, max: 0.7 } } } };
  assert.match(concentrationView({ concentration: empty }, null).solverNote, /Single days range from 60% to 70%/, 'a day with no public USD is not 0%');
});
