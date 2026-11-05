import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elasticityView } from './elasticity_view.ts';

const sample = { empty: 'sample', checks: [{ name: 'a', text: 'b' }] };
const stat = (estimate, lo, hi, underpowered) => ({ estimate, lo, hi, p: 0.22, pMin: 1e-4, mde: 1.2, underpowered });
const doc = (usable, e1, events = 5) => ({
  asOf: '2026-11-04T23:59:59Z', reps: 10000, from: '2026-10-04', to: '2026-11-04', daysRead: 32, frozenEvents: events, notMeasured: null, notRun: [],
  census: { frontends: 356, withStableRun: 37, changes: 18, events: Array.from({ length: events }, () => ({ firstDayAfter: '2026-10-20' })), nearMisses: [] },
  main: { usable, dropped: [], events: [], e1, e2: stat(1, -3, 5, true) },
  checks: { a: { label: 'Drop the largest', usable: 4, dropped: [], events: [], e1: stat(-0.5, -1.4, 0.4, true), e2: null } },
});

test('T-5.3 interval spanning zero: the first line says underpowered', () => {
  const v = elasticityView(doc(5, stat(-0.52, -1.4, 0.4, true)), sample);
  assert.equal(v.head, 'Underpowered');
  assert.match(v.mde, /1\.20/);
  assert.match(v.empty, /from 5 of 5 fee changes in the 32 frozen chain days, 4 Oct to 4 Nov\. token_diff swaps only\./);
});

test('T-5.3 effect below the smallest one it could see: underpowered even if the interval clears zero', () => {
  assert.equal(elasticityView(doc(5, stat(-2, -2.5, -1.5, true)), sample).head, 'Underpowered');
  assert.equal(elasticityView(doc(5, stat(-2, -2.5, -1.5, false)), sample).head, 'Volume Leaves When Fees Rise');
});

test('T-5.4 under 3 usable events: states the count and keeps the fee trace and threshold as the lead', () => {
  const v = elasticityView(doc(2, null), sample);
  assert.match(v.empty, /Only 2 of the 5 fee changes found are usable/);
  assert.match(v.empty, /fee trace and the threshold stay the lead/);
  assert.equal(v.plot, null);
});

test('T-5.4 no event at all: says no fee change passes the rules, names the closest miss and the search', () => {
  const d = doc(0, null, 0);
  d.census.nearMisses = [{ frontend: '1click-gemwallet', from: 50, to: 101, lastDayBefore: '2026-10-24', firstDayAfter: '2026-11-01', missed: '2 days at the new rate (7 needed), 8 days from the old rate to the new (at most 7)' }];
  const v = elasticityView(d, sample);
  assert.equal(v.head, 'Not Enough Fee Changes to Say Yet');
  assert.match(v.empty, /^No fee change passes the pre-registered rules in the 32 frozen chain days, 4 Oct to 4 Nov\./);
  assert.match(v.empty, /Pricing Power reads Not Measured/);
  assert.equal(v.checks[0].text, '1click-gemwallet went from 50 to 101 bps between 24 Oct and 1 Nov, with 2 days at the new rate (7 needed), 8 days from the old rate to the new (at most 7). Not used.');
  assert.match(v.checks[1].text, /^356 frontends/);
  assert.deepEqual(v.days, []);
  assert.match(v.caption, /None does yet\.$/);
  assert.equal(v.mde, 'Smallest effect it could see: none yet, with under 3 usable fee changes to test');
});

test('the date axis spans the days read, with five labels', () => {
  const v = elasticityView(doc(0, null, 0), sample);
  assert.deepEqual(v.axis.labels.map((l) => l[0]), ['4 Oct', '12 Oct', '20 Oct', '27 Oct', '4 Nov']);
  assert.equal(v.axis.start, '2026-10-04');
});

test('missing file falls back to the sample', () => {
  const v = elasticityView(null, sample);
  assert.equal(v.live, false);
  assert.equal(v.axis, null);
});
