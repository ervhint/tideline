import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costParts, feeTrace, q3Spread, fillerUsd, solverConcentrationChain, MIN_DAY_SWAPS } from './realised_cost.mjs';

const row = (o) => ({ t: 'swap', k: 'd', solver: 's1', ref: '1click-lifi', fee: 20, b: '1k-10k', n: 1, np: 1, vol: 1000, in: 1000, out: 990, ...o });
const day = (d, swaps) => ({ head: { day: d }, swaps });

test('cost parts of one token_diff group, worked by hand, add up to the all-in cost (INV-4)', () => {
  // in 998, fee 20 bps: gross = 998 / 0.998 = 1000, app fee $2. out 990: all-in = 10/1000 = 100 bps.
  const c = costParts([row({ in: 998, out: 990 })], 0.01);
  assert.ok(Math.abs(c.allInBps - 100) < 1e-9);
  assert.ok(Math.abs(c.appFeeBps - 20) < 1e-9);
  assert.equal(c.protocolBps, 0.01);
  assert.ok(Math.abs(c.spreadBps - 79.99) < 1e-9);
  assert.ok(Math.abs(c.partsGapBps) <= 0.5);
  assert.equal(c.grossUsd, 1000);
});

test('transfer swaps count with no app fee and no protocol fee; the protocol part is weighted by token_diff USD', () => {
  const c = costParts([row({ in: 1000, out: 990, fee: 0 }), row({ k: 't', ref: '', fee: null, in: 1000, out: 980 })], 0.01);
  assert.ok(Math.abs(c.allInBps - 150) < 1e-9); // (2000 - 1970) / 2000
  assert.equal(c.appFeeBps, 0);
  assert.ok(Math.abs(c.protocolBps - 0.005) < 1e-12);
  assert.ok(Math.abs(c.spreadBps - 149.995) < 1e-9);
});

test('unreadable fees, failed price checks and unpriced swaps are left out and counted, never dropped silently', () => {
  const c = costParts([
    row({ fee: null, in: 500, out: 499 }),
    row({ in: 100, out: 70 }), row({ in: 100, out: 130 }), // out/in 0.70 and 1.30: outside 0.8 to 1.25
    row({ n: 3, np: 0, in: 0, out: 0 }), row({ n: 2, np: 1 }),
  ], 0.01);
  assert.deepEqual(c.left.feeUnreadable, { groups: 1, swaps: 1, usd: 500 });
  assert.deepEqual(c.left.priceCheck, { groups: 2, swaps: 2, usd: 200 });
  assert.equal(c.left.notBothPriced.swaps, 4);
  assert.equal(c.swaps, 1);
  assert.equal(c.groups, 1);
});

test('the price band edges are kept: out/in of exactly 0.8 and 1.25 pass', () => {
  assert.equal(costParts([row({ fee: 0, in: 100, out: 80 })], 0).groups, 1);
  assert.equal(costParts([row({ fee: 0, in: 100, out: 125 })], 0).groups, 1);
});

test('nothing priced gives null parts, not zero', () => {
  const c = costParts([row({ np: 0, in: 0, out: 0 })], 0.01);
  assert.equal(c.allInBps, null);
  assert.equal(c.spreadBps, null);
});

test('the fee trace splits by size and kind; all sizes leave out the unpriced bucket', () => {
  const t = feeTrace([day('2026-11-01', [row({}), row({ k: 't', fee: null, b: '0-1k', vol: 100, in: 100, out: 99 }), row({ b: 'unpriced', np: 0, vol: 0, in: 0, out: 0 })])], 0.01);
  assert.equal(t.bySize['1k-10k'].all.swaps, 1);
  assert.equal(t.bySize['0-1k'].transfer.swaps, 1);
  assert.equal(t.bySize['0-1k'].tokenDiff.swaps, 0);
  assert.equal(t.allSizes.all.swaps, 2);
  assert.equal(t.allSizes.all.left.notBothPriced.swaps, 0);
  assert.deepEqual(t.days, ['2026-11-01']);
});

test('Q3 spread is the median of daily spreads; thin days are skipped; under 5 usable days is Not Measured', () => {
  const g = (spread) => row({ fee: 0, n: MIN_DAY_SWAPS, np: MIN_DAY_SWAPS, in: 10000, out: 10000 * (1 - spread / 1e4) });
  const days = [2, 4, 6, 8, 100].map((s, i) => day(`2026-11-0${i + 1}`, [g(s)]));
  const q = q3Spread(days, 0);
  assert.equal(q.usableDays, 5);
  assert.ok(Math.abs(q.spreadBps - 6) < 1e-9);
  const thin = [...days.slice(0, 4), day('2026-11-05', [row({ fee: 0, n: MIN_DAY_SWAPS - 1, np: MIN_DAY_SWAPS - 1 })])];
  const q2 = q3Spread(thin, 0);
  assert.equal(q2.usableDays, 4);
  assert.equal(q2.spreadBps, null);
  assert.equal(q2.perDay[4].usable, false);
});

test('a solver field naming several accounts splits its USD equally; unpriced rows carry none', () => {
  const u = fillerUsd([row({ solver: 'a+b', vol: 100 }), row({ solver: 'a', vol: 50 }), row({ solver: 'c', b: 'unpriced', vol: 0 })]);
  assert.deepEqual([...u], [['a', 100], ['b', 50]]);
});

test('E3 concentration: HHI and top 3 by hand, the token_diff side figure, and one-day stability', () => {
  const d1 = day('2026-11-01', [row({ solver: 'hub', k: 't', vol: 600 }), row({ solver: 'a', vol: 200 }), row({ solver: 'b', vol: 100 }), row({ solver: 'c', vol: 100 })]);
  const d2 = day('2026-11-02', [row({ solver: 'a', vol: 1000 })]);
  const c = solverConcentrationChain([d1]);
  // shares 0.6, 0.2, 0.1, 0.1: HHI 3600 + 400 + 100 + 100 = 4200, top 3 = 0.9
  assert.ok(Math.abs(c.allSizes.hhi - 4200) < 1e-9);
  assert.ok(Math.abs(c.allSizes.top3 - 0.9) < 1e-12);
  assert.equal(c.allSizes.top[0].account, 'hub');
  assert.ok(Math.abs(c.tokenDiffOnly.top3 - 1) < 1e-12);
  assert.equal(c.bySize['1k-10k'].sampled, 4);
  assert.equal(c.stability, false);
  const s = solverConcentrationChain([d1, d2]).stability;
  assert.deepEqual(s.perDayTop3.map((x) => x.day), ['2026-11-01', '2026-11-02']);
  assert.equal(s.perDayTop3[1].top3, 1);
});
