import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceQuote, traceArchive, partsGapBps, nearShare } from './fee_trace.mjs';

const row = (over = {}) => ({
  pair: 'ETH-USDC', sizeUsd: 10000, sampledAt: '2026-11-01T00:00:00Z', http: 201,
  reference: { mid: 2000, usdcUsdtMid: 1 },
  response: {
    quote: { amountInFormatted: '5', amountOutFormatted: '9979.7', withdrawFee: '300000' }, // fair 10000; out is 20.3 bps less
    quoteRequest: { appFees: [{ recipient: 'x', fee: 20 }] },
  },
  ...over,
});

test('T-3.1 parts: 20 bps app fee + 0.3 bps withdraw fee leave nothing unexplained', () => {
  const t = traceQuote(row());
  assert.ok(Math.abs(t.allInBps - 20.3) < 1e-6);
  assert.equal(t.appFeeBps, 20);
  assert.ok(Math.abs(t.withdrawBps - 0.3) < 1e-6);
  assert.ok(Math.abs(t.unexplainedBps) < 1e-6);
});

test('T-3.1 remainder shows as unexplained and parts add up within 0.5 bps', () => {
  const [g] = traceArchive([row({ response: { ...row().response, quote: { amountInFormatted: '5', amountOutFormatted: '9950', withdrawFee: '300000' } } })]);
  assert.ok(Math.abs(g.unexplainedBps - 29.7) < 1e-6);
  assert.ok(Math.abs(partsGapBps(g)) < 0.5);
});

test('T-3.1 a failed quote is counted, not dropped', () => {
  const [g] = traceArchive([row(), row({ http: 500, response: { error: 'x' } })]);
  assert.equal(g.n, 1);
  assert.equal(g.failed, 1);
});

test('T-3.1 a group with only failures reports no cost', () => {
  const [g] = traceArchive([row({ http: 0, response: { error: 'x' } })]);
  assert.equal(g.n, 0);
  assert.equal(g.allInBps, undefined);
});

test('FR-05 the protocol fee is its own part, and app + withdraw + protocol + rest still add up', () => {
  const t = traceQuote(row({ response: { ...row().response, quote: { amountInFormatted: '5', amountOutFormatted: '9950', withdrawFee: '300000' } } }), 0.01);
  assert.equal(t.protocolBps, 0.01);
  assert.ok(Math.abs(t.unexplainedBps - 29.69) < 1e-6);
  const [g] = traceArchive([row()], 0.01);
  assert.equal(g.protocolBps, 0.01);
  assert.ok(Math.abs(partsGapBps(g)) < 1e-9);
});

test('FR-05 NEAR share of app fees per size bucket, over the last 30 days only', () => {
  const r = (day, bucket, usd, fee, near) => ({ day, bucket, usd_in: usd, app_fee_usd: fee, near_fee_usd: near });
  const n = nearShare([r('2026-10-01', '1k-10k', 1e6, 5000, 500), r('2026-10-30', '1k-10k', 1e6, 5000, 1500), r('2026-08-01', '1k-10k', 1e9, 1e6, 0)], '2026-10-30');
  const b = n.buckets['1k-10k'];
  assert.equal(n.from, '2026-10-01');
  assert.ok(Math.abs(b.appFeeBps - 50) < 1e-9);
  assert.ok(Math.abs(b.nearBps - 10) < 1e-9);
  assert.ok(Math.abs(b.nearShareOfAppFees - 0.2) < 1e-9);
});
