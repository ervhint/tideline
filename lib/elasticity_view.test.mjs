import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elasticityView } from './elasticity_view.ts';

const sample = { empty: 'sample', checks: [{ name: 'a', text: 'b' }] };
const stat = (estimate, lo, hi, underpowered) => ({ estimate, lo, hi, p: 0.22, pMin: 1e-4, mde: 1.2, underpowered });
const doc = (usable, e1) => ({
  asOf: '2026-10-29T23:59:59Z', reps: 10000, frozenEvents: 22, notRun: ['x'],
  main: { usable, dropped: [{ frontend: 'f', firstDayAfter: '2026-01-02', reason: 'r' }], events: [{ firstDayAfter: '2026-01-03' }], e1, e2: stat(1, -3, 5, true) },
  checks: { a: { label: 'Drop the largest', usable: 16, dropped: [], events: [], e1: stat(-0.5, -1.4, 0.4, true), e2: null } },
});

test('T-5.3 interval spanning zero: the first line says underpowered', () => {
  const v = elasticityView(doc(17, stat(-0.52, -1.4, 0.4, true)), sample);
  assert.equal(v.head, 'Underpowered');
  assert.match(v.mde, /1\.20/);
});

test('T-5.3 effect below the smallest one it could see: underpowered even if the interval clears zero', () => {
  assert.equal(elasticityView(doc(17, stat(-2, -2.5, -1.5, true)), sample).head, 'Underpowered');
  assert.equal(elasticityView(doc(17, stat(-2, -2.5, -1.5, false)), sample).head, 'Volume Leaves When Fees Rise');
});

test('T-5.4 under 3 usable events: states the count and keeps the fee trace and threshold as the lead', () => {
  const v = elasticityView(doc(2, null), sample);
  assert.match(v.empty, /Only 2 of the 22/);
  assert.match(v.empty, /fee trace and the threshold stay the lead/);
});

test('FR-21 fee switch: the other control venues are listed after CoW Swap', () => {
  const d = { ...doc(17, stat(-0.52, -1.4, 0.4, true)), feeSwitch: { label: 'Protocol fee switch', len: 14, intentsLogChange: Math.log(1.12), cowLogChange: Math.log(1.31), change: Math.log(1.12 / 1.31), others: [{ name: '1inch', change: Math.log(0.96) }, { name: '0x', change: Math.log(1.26) }] } };
  const t = elasticityView(d, sample).checks.find((c) => c.name === 'Protocol fee switch').text;
  assert.match(t, /1Click volume moved \+12% and CoW Swap \+31%, so −15% against the control\. Against the other venues: 1inch −4%, 0x \+26%\./);
});

test('missing file falls back to the sample', () => {
  assert.equal(elasticityView(null, sample).live, false);
});
