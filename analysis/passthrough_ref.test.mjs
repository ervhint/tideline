import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costBps, passThroughRef, MIN_PRICED } from './passthrough_ref.mjs';

// A window where users pay `bps` against Binance and `exp` against the Explorer's own USD values.
const w = (bps, exp = bps, priced = 100) => ({ swaps: priced, priced, refIn: 1e6, refOut: 1e6 * (1 - bps / 1e4), expIn: 1e6, expOut: 1e6 * (1 - exp / 1e4) });
const ev = (frontend, from, to, before, after) => ({ frontend, firstDayAfter: '2026-01-01', from, to, windows: { before, after } });

test('FR-08 cost in bps from Binance-priced totals', () => {
  assert.ok(Math.abs(costBps(w(25)) - 25) < 1e-9);
  assert.ok(Math.abs(costBps(w(25, 30), false) - 30) < 1e-9);
});

test('FR-08 full pass-through: every fee change reaches the user, estimate 1', () => {
  const r = passThroughRef([ev('a', 0, 20, w(30), w(50)), ev('b', 10, 30, w(40), w(60)), ev('c', 30, 20, w(55), w(45))], { boot: 500 });
  assert.equal(r.usable, 3);
  assert.ok(Math.abs(r.estimate - 1) < 1e-9);
  assert.ok(r.lo <= 1 + 1e-9 && r.hi >= 1 - 1e-9);
});

test('FR-08 the Explorer slope on the same swaps is reported beside it, so a price bias shows', () => {
  const r = passThroughRef([ev('a', 0, 20, w(30, 30), w(40, 50)), ev('b', 10, 30, w(40, 40), w(50, 60))], { boot: 200 });
  assert.ok(Math.abs(r.estimate - 0.5) < 1e-9);
  assert.ok(Math.abs(r.explorerSameSwaps - 1) < 1e-9);
});

test('FR-08 a window with too few priced swaps is dropped and says why', () => {
  const r = passThroughRef([ev('a', 0, 20, w(30), w(50, 50, MIN_PRICED - 1)), ev('b', 0, 20, w(30), w(50)), ev('c', 0, 20, w(30), w(50))], { boot: 200 });
  assert.equal(r.usable, 2);
  assert.match(r.dropped[0].reason, /priced swaps/);
});

test('FR-08 under 2 usable events gives no estimate', () => {
  const r = passThroughRef([ev('a', 0, 20, w(30), w(50))]);
  assert.equal(r.estimate, null);
});
