import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costParts, feeTrace, q3Spread, fillerUsd, solverConcentrationChain, MIN_DAY_SWAPS } from './realised_cost.mjs';
import { TREASURY } from './treasury.mjs';

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

const viaTreasury = (o) => row({ k: 't', solver: TREASURY, ref: '', fee: null, ...o });

test('A2 rule 2: treasury groups are left out of E3, and the figure with the treasury as one account is gone', () => {
  const d = day('2026-11-01', [viaTreasury({ vol: 9000 }), row({ solver: 'a', vol: 600 }), row({ solver: 'b', vol: 300 }), row({ solver: 'c', vol: 100 })]);
  const c = solverConcentrationChain([d, day('2026-11-02', [viaTreasury({ vol: 9000 }), row({ solver: 'a', vol: 100 })])]);
  assert.ok(c.allSizes.top.every((x) => x.account !== TREASURY));
  assert.equal(c.allSizes.usd, 1100);
  assert.equal(c.bySize['1k-10k'].usd, 1100);
  assert.equal(c.bySize['1k-10k'].sampled, 4, 'only public swaps are counted');
  assert.equal(c.stability.perDayTop3[1].top3, 1);
  assert.ok(!JSON.stringify(c).includes(TREASURY));
});

test('A2 rule 2: treasury groups are left out of the Q3 spread, and section 8 minimum swaps count public swaps only', () => {
  const g = (spread) => row({ fee: 0, n: MIN_DAY_SWAPS, np: MIN_DAY_SWAPS, in: 10000, out: 10000 * (1 - spread / 1e4) });
  const noise = viaTreasury({ n: 1000, np: 1000, in: 1e6, out: 9e5 });
  const q = q3Spread([2, 4, 6, 8, 10].map((s, i) => day(`2026-11-0${i + 1}`, [g(s), noise])), 0);
  assert.ok(Math.abs(q.spreadBps - 6) < 1e-9);
  const onlyTreasury = q3Spread([1, 2, 3, 4, 5].map((i) => day(`2026-11-0${i}`, [noise])), 0);
  assert.equal(onlyTreasury.usableDays, 0);
  assert.equal(onlyTreasury.spreadBps, null);
});

test('A2 rule 6: the cost split is public swaps only; treasury groups get their own line with the all-in cost and nothing else', () => {
  const t = feeTrace([day('2026-11-01', [row({ in: 998, out: 990 }), row({ k: 't', solver: 'other-filler', ref: '', fee: null, in: 1000, out: 995 }), viaTreasury({ in: 1000, out: 990 })])], 0.01);
  const k = t.bySize['1k-10k'];
  assert.equal(k.all.swaps, 2);
  assert.equal(k.transfer.swaps, 1, 'a transfer swap through another filler stays public');
  assert.ok(Math.abs(k.all.grossUsd - 2000) < 1e-9);
  assert.equal(k.confidential.swaps, 1);
  assert.equal(k.confidential.inUsd, 1000);
  assert.ok(Math.abs(k.confidential.allInBps - 100) < 1e-9);
  for (const f of ['appFeeBps', 'protocolBps', 'spreadBps', 'partsGapBps']) assert.ok(!(f in k.confidential), `${f} must not exist, not even as 0`);
  assert.equal(t.allSizes.confidential.swaps, 1);
});

test('A2 rule 6: the price check and unpriced counts still apply on the confidential path', () => {
  const k = feeTrace([day('2026-11-01', [viaTreasury({ in: 100, out: 50 }), viaTreasury({ n: 3, np: 1, in: 1000, out: 990 })])], 0.01).bySize['1k-10k'].confidential;
  assert.equal(k.swaps, 1);
  assert.equal(k.left.priceCheck.swaps, 1);
  assert.equal(k.left.notBothPriced.swaps, 2);
  const none = feeTrace([day('2026-11-01', [row({})])], 0.01).bySize['1k-10k'].confidential;
  assert.equal(none.allInBps, null);
});
