import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feeView } from './fee_view.ts';

const sample = { total: '$20.30', parts: [], card: { value: '20.3 bps' } };
const left = { notBothPriced: { swaps: 3 }, feeUnreadable: { groups: 1, swaps: 2, usd: 10 }, priceCheck: { groups: 0, swaps: 0, usd: 0 } };
const parts = (o) => ({ groups: 2, swaps: 10, grossUsd: 100000, outUsd: 99000, allInBps: 100, appFeeBps: 20, protocolBps: 0.01, spreadBps: 79.99, partsGapBps: 0, left, ...o });
const trace = {
  from: '2026-10-29', to: '2026-11-04', days: 7, gapsInWindow: 0, protocolFee: { bps: 0.01, collector: '7066024d3f20f94de601c003163367873cca78507eeca4df66d9be645f197f05' },
  trace: { days: [], bySize: { '10k-100k': { all: parts({}), tokenDiff: parts({ grossUsd: 40000 }), transfer: parts({ grossUsd: 60000, appFeeBps: 0 }) } }, allSizes: {} },
  nearRevenue: { bps: 4.99, from: '2026-10-06', to: '2026-11-04' },
};

test('T-3.1 S2 view: the bar parts add up to the all-in cost within 0.5 bps, and the dollars follow from $10,000', () => {
  const v = feeView(trace, sample);
  assert.equal(v.live, true);
  const sum = v.parts.filter((p) => p.share).reduce((s, p) => s + p.share, 0);
  assert.ok(Math.abs(sum - 100) < 0.5);
  assert.equal(v.total, '$100.00');
  assert.equal(v.card.value, '100.0 bps');
  assert.match(v.parts.find((p) => p.key === 'app').text, /60% of this USD/);
});

test('T-3.1 S2 view on the published file: parts sum within 0.5 bps (INV-4)', () => {
  const real = JSON.parse(readFileSync('data/published/fee_trace.json', 'utf8'));
  const v = feeView(real, sample);
  assert.equal(v.live, true);
  const g = real.trace.bySize['10k-100k'].all;
  const sum = v.parts.filter((p) => p.share).reduce((s, p) => s + p.share, 0);
  assert.ok(Math.abs(sum - g.allInBps) < 0.5);
  for (const k of Object.values(real.trace.bySize)) for (const c of Object.values(k)) if (c.partsGapBps != null) assert.ok(Math.abs(c.partsGapBps) <= 0.5);
});

test('T-3.2 S2 view: the number carries its plain-language line, its query, and the unexplained part is listed', () => {
  const v = feeView(trace, sample);
  assert.match(v.explain, /\$10,000 swap/);
  assert.match(v.query, /PREREG\.md section 7/);
  assert.ok(v.parts.some((p) => p.key === 'unexplained'));
  assert.match(v.bannerText, /3 swaps without a price/);
});

test('T-3.1 S2 view: a missing file or an unmeasured bucket falls back to the sample', () => {
  assert.equal(feeView(null, sample).live, false);
  const none = { ...trace, trace: { ...trace.trace, bySize: { '10k-100k': { ...trace.trace.bySize['10k-100k'], all: parts({ allInBps: null }) } } } };
  assert.equal(feeView(none, sample).live, false);
});
