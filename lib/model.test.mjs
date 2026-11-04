import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vStar, vStarRange, issuancePctOn, vStarPath, firstReached, HSP029, revenueMaxFeeBps, atFee } from './model.ts';

// Hand-worked fixture. Supply 1,000,000,000 NEAR, price $2, issuance 2% a year, gas burn 2,000,000 NEAR a year,
// revenue rate 5 bps ($0.0005 per $), all revenue spent on buybacks.
//   issuance 20M NEAR/yr x $2 = $40M/yr; gas 2M x $2 = $4M/yr; net $36M/yr = $3M/month
//   V* = $3,000,000 / 0.0005 = $6,000,000,000 a month
const m = {
  supply: 1e9, revenueRate: 5e-4, revenueRateRange: { min: 2.5e-4, max: 1e-3 },
  gasBurnNearPerYear: 2e6, todayVolume: 3e9, priceUsd: 2,
};
const i = { issuancePct: 2, price: 2, buybackShare: 1 };

test('T-4.1 V* matches the hand-worked fixture', () => {
  assert.ok(Math.abs(vStar(i, m) - 6e9) < 1);
});

test('T-4.1 half the revenue to buybacks doubles V*; no gas burn gives $6.667B', () => {
  assert.ok(Math.abs(vStar({ ...i, buybackShare: 0.5 }, m) - 12e9) < 1);
  assert.ok(Math.abs(vStar(i, { ...m, gasBurnNearPerYear: 0 }) - 20e9 / 3) < 1);
});

test('INV-5 V* falls when revenue per dollar rises, and rises with price or issuance', () => {
  assert.ok(vStar(i, { ...m, revenueRate: 6e-4 }) < vStar(i, m));
  assert.ok(vStar({ ...i, price: 3 }, m) > vStar(i, m));
  assert.ok(vStar({ ...i, issuancePct: 3 }, m) > vStar(i, m));
});

test('T-4.1 gas burn above issuance gives zero, never a negative V*', () => {
  assert.equal(vStar({ ...i, issuancePct: 0.1 }, m), 0);
});

test('T-4.4 interval: the highest revenue rate gives the lowest V*', () => {
  const r = vStarRange(i, m);
  assert.ok(Math.abs(r.low - 3e9) < 1 && Math.abs(r.mid - 6e9) < 1 && Math.abs(r.high - 12e9) < 1);
});

test('T-4.2 HSP-029: 2.5% until the buffer ends, then a straight line to 1.6%', () => {
  const day = (s) => new Date(s + 'T00:00:00Z');
  assert.equal(issuancePctOn(day('2026-12-01'), true), 2.5);
  assert.equal(issuancePctOn(day('2030-01-01'), true), 1.6);
  const mid = issuancePctOn(day('2028-01-31'), true); // 12 months into the 24-month ramp
  assert.ok(Math.abs(mid - 2.05) < 0.01, String(mid));
  assert.equal(issuancePctOn(day('2030-01-01'), false), 2.5);
  assert.equal(HSP029.rampMonths, 24);
});

test('T-4.2 the dated path: the passing path falls below the failing path, and a date is found when volume grows', () => {
  const from = new Date(Date.UTC(2026, 10, 1));
  const pass = vStarPath(m, 2, 1, true, 2, from, 60);
  const fail = vStarPath(m, 2, 1, false, 2, from, 60);
  assert.equal(pass.length, 60);
  assert.ok(pass.at(-1).vStar < fail.at(-1).vStar);
  assert.equal(pass[0].month, '2026-11');
  const hit = firstReached(fail);
  assert.ok(hit && hit.index > 0);
  assert.equal(firstReached(vStarPath(m, 2, 1, false, 1, from, 60)), null); // flat volume never reaches it
});

// Kept from the first version: the SRS 1.3 figures, rebuilt with that note's inputs (supply 1,310.34M, $4.34, 5.54 bps, no gas).
const srs = { supply: 1310.34e6, revenueRate: 5.54e-4, revenueRateRange: { min: 5.54e-4, max: 5.54e-4 }, gasBurnNearPerYear: 0, todayVolume: 3.89e9, priceUsd: 4.34 };
const billions = (n) => Math.round(n / 1e8) / 10;

test('T-4.1 V* matches the hand-worked figures in SRS 1.3', () => {
  assert.equal(billions(vStar({ issuancePct: 1.6, price: 4.34, buybackShare: 1 }, srs)), 13.7);
  assert.equal(billions(vStar({ issuancePct: 2.5, price: 4.34, buybackShare: 1 }, srs)), 21.4);
});

test('T-4.3 months to reach: volume that doubles in 12 months reaches a V* of twice today in month 12', () => {
  // 0.6% of 1B NEAR at $2 is $12M a year, $1M a month; at 5 bps that is a V* of $2B, twice today's $1B.
  const small = { ...m, todayVolume: 1e9, gasBurnNearPerYear: 0 };
  const path = vStarPath(small, 2, 1, false, 2, new Date(Date.UTC(2026, 10, 1)), 60, 0.6);
  assert.equal(firstReached(path).index, 12);
});

test('FR-11 revenue-maximizing fee: shift / (-1 - e) below -1, none at -1 or above', () => {
  assert.ok(Math.abs(revenueMaxFeeBps(-1.5) - 10) < 1e-9);
  assert.ok(Math.abs(revenueMaxFeeBps(-2) - 5) < 1e-9);
  assert.equal(revenueMaxFeeBps(-1), null);
  assert.equal(revenueMaxFeeBps(-0.5), null);
});

test('FR-10 at the current fee elasticity changes nothing; a higher fee needs less volume and, with e = -1, loses volume', () => {
  const m = { supply: 1.3e9, revenueRate: 5e-4, revenueRateRange: { min: 4e-4, max: 6e-4 }, gasBurnNearPerYear: 0, todayVolume: 4e9, priceUsd: 4, feeBps: 15 };
  const i = { issuancePct: 1.6, price: 4, buybackShare: 1 };
  const now = atFee(i, m, 15, -0.5);
  assert.ok(Math.abs(now.volume - 4e9) < 1e-3);
  assert.ok(Math.abs(now.need - vStar(i, m)) < 1e-3);
  const up = atFee(i, m, 35, -1);
  assert.ok(Math.abs(up.volume - 4e9 * (20 / 40)) < 1e-3, 'volume halves when fee + 5 doubles');
  assert.ok(Math.abs(up.need - vStar(i, m) * (15 / 35)) < 1e-3, 'more revenue per dollar needs less volume');
});
