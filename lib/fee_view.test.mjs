import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeView } from './fee_view.ts';

const sample = { total: '$20.30', parts: [], card: { value: '20.3 bps' } };
const group = { pair: 'ETH-USDC', sizeUsd: 10000, n: 10, failed: 0, allInBps: 22.3, allInMinBps: 20.3, allInMaxBps: 28.6, appFeeBps: 20, withdrawBps: 0.3, unexplainedBps: 2 };
const trace = { asOf: '2026-11-01T07:22:49.031Z', from: '2026-10-30T11:24:05.791Z', quotes: 160, groups: [group] };

test('T-3.1 S2 view: shown parts add up to the total within 0.5 bps', () => {
  const v = feeView(trace, sample);
  assert.equal(v.live, true);
  const bar = v.parts.filter((p) => p.share);
  const sum = bar.reduce((s, p) => s + p.share, 0);
  assert.ok(Math.abs(sum - 22.3) < 0.5);
  assert.equal(v.total, '$22.30');
  assert.equal(v.card.value, '22.3 bps');
});

test('T-3.2 S2 view: the number carries its plain-language line and the unexplained part is listed', () => {
  const v = feeView(trace, sample);
  assert.match(v.explain, /\$10,000 swap/);
  assert.ok(v.parts.some((p) => p.key === 'unexplained'));
});

test('T-3.1 S2 view: a missing file or empty group falls back to the sample', () => {
  assert.equal(feeView(null, sample).live, false);
  assert.equal(feeView({ ...trace, groups: [{ ...group, n: 0 }] }, sample).live, false);
});
