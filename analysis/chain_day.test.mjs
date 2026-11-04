import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactTx, fillersOfSample, mergeFillers, swapsOfDay, groupSwaps, dayFile, parseDayFile, summarizeDays, gapsBetween, digestOf } from './chain_day.mjs';

const log = (event, data) => `EVENT_JSON:${JSON.stringify({ standard: 'dip4', version: '0.4.3', event, data })}`;
const tx = (hash, ...logs) => ({ transaction: { hash }, receipts: [{ execution_outcome: { outcome: { logs } } }] });
const USDC = 'nep141:usdc.near', WNEAR = 'nep141:wrap.near';
const PRICE = { [USDC]: 1, [WNEAR]: 4 };
const DEC = { [USDC]: 6, [WNEAR]: 24 };
const usdAt = (ts, side) => {
  let t = 0;
  for (const { token, raw } of side) { if (PRICE[token] == null) return null; t += (Number(raw) / 10 ** DEC[token]) * PRICE[token]; }
  return t;
};

// 1,000 USDC in, 250 wNEAR back, 5 bps app fee, solver s1.
const diffTx = tx('H1',
  log('token_diff', [
    { intent_hash: 'U', account_id: 'user1', referral: '1click-lifi', diff: { [USDC]: '-1000000000', [WNEAR]: '250000000000000000000000000' } },
    { intent_hash: 'S', account_id: 's1', diff: { [USDC]: '1000000000', [WNEAR]: '-250000000000000000000000000' } },
  ]),
  log('transfer', [{ intent_hash: 'F', account_id: 'user1', receiver_id: 'fees.near', tokens: { [USDC]: '500000' } }]));
const FILLERS = new Set(['s1', 'hub']);

test('compactTx keeps the referred swap with its solver and fee, and only the transfers that touch a filler', () => {
  const c = compactTx(tx('H2', ...JSON.parse(JSON.stringify([])), ...[
    log('token_diff', [{ intent_hash: 'U', account_id: 'u', referral: 'r', diff: { [USDC]: '-10', [WNEAR]: '1' } }, { intent_hash: 'S', account_id: 's1', diff: { [USDC]: '10', [WNEAR]: '-1' } }]),
    log('transfer', [{ account_id: 'a', receiver_id: 'b', tokens: { [USDC]: '1' } }, { account_id: 'a', receiver_id: 'hub', tokens: { [USDC]: '2' } }]),
  ]), 100, FILLERS);
  assert.deepEqual(c.swaps.map((s) => [s.referral, s.solver, s.account]), [['r', 's1', 'u']]);
  assert.deepEqual(c.transfers.map((t) => [t.from, t.to]), [['a', 'hub']]);
  assert.equal(c.ts, 100);
});

test('fillers of a sample: token_diff solvers and hubs with at least three partners each way', () => {
  const t = (from, to) => log('transfer', [{ account_id: from, receiver_id: to, tokens: { [USDC]: '1' } }]);
  const sample = [diffTx, tx('A', t('u1', 'h'), t('h', 'u1')), tx('B', t('u2', 'h'), t('h', 'u2')), tx('C', t('u3', 'h'), t('h', 'u3')), tx('D', t('x', 'y'), t('y', 'x'))];
  assert.deepEqual(fillersOfSample(sample), { solvers: ['s1'], hubs: ['h'] });
});

test('the filler list only grows and remembers the day each filler was first seen', () => {
  const a = mergeFillers(null, { solvers: ['s2', 's1'], hubs: ['h'] }, '2026-11-03');
  assert.deepEqual(a.fillers.map((f) => [f.account, f.kind, f.since]), [['h', 'hub', '2026-11-03'], ['s1', 'solver', '2026-11-03'], ['s2', 'solver', '2026-11-03']]);
  const b = mergeFillers(a, { solvers: ['s3', 's1'], hubs: [] }, '2026-11-10');
  assert.equal(b.updated, '2026-11-10');
  assert.deepEqual(b.fillers.map((f) => [f.account, f.since]), [['h', '2026-11-03'], ['s1', '2026-11-03'], ['s2', '2026-11-03'], ['s3', '2026-11-10']]);
});

// A day: one token_diff swap, one transfer swap through the hub (across two transactions), one unpriced swap, one user in both.
const t = (from, to, token, raw) => log('transfer', [{ account_id: from, receiver_id: to, tokens: { [token]: raw } }]);
const dayTxs = [
  diffTx,
  tx('T1', t('u2', 'hub', USDC, '2000000000')),
  tx('T2', t('hub', 'u2', WNEAR, '490000000000000000000000000')),
  tx('T3', t('u3', 'hub', USDC, '5000000')),
  tx('T4', t('hub', 'u3', 'nep141:mystery.near', '7')),
  tx('T5', t('user1', 'hub', USDC, '1'), t('hub', 'user1', WNEAR, '1')), // user1 is already a token_diff swap: not counted twice
];
const rows = dayTxs.map((x, i) => compactTx(x, 1000 + i, FILLERS));
const swaps = swapsOfDay(rows, FILLERS);

test('a day holds token_diff and transfer swaps, and a user is counted once', () => {
  assert.deepEqual(swaps.map((s) => [s.kind, s.solver, s.referral]), [['d', 's1', '1click-lifi'], ['t', 'hub', null], ['t', 'hub', null]]);
});

test('groupSwaps buckets by the priced side, keeps unpriced apart, and sums cost only where both sides are priced', () => {
  const { swapRows, routeRows } = groupSwaps(swaps, usdAt);
  const d = swapRows.find((r) => r.k === 'd');
  assert.deepEqual([d.ref, d.fee, d.b, d.n, d.np, d.vol, d.in, d.out], ['1click-lifi', 5, '1k-10k', 1, 1, 1000, 1000, 1000]);
  const priced = swapRows.find((r) => r.k === 't' && r.b === '1k-10k');
  assert.deepEqual([priced.n, priced.np, priced.vol, priced.in, priced.out], [1, 1, 2000, 2000, 1960]);
  const half = swapRows.find((r) => r.b === '0-1k');
  assert.deepEqual([half.n, half.np, half.vol, half.in, half.out], [1, 0, 5, 0, 0]); // gave 5 USDC, got an unpriced token: sized by the priced side, no cost worked out
  assert.equal(swapRows.some((r) => r.b === 'unpriced'), false);
  assert.equal(routeRows.reduce((s, r) => s + r.n, 0), 3);
});

test('a swap with neither side priced goes to the unpriced bucket with no USD', () => {
  const { swapRows } = groupSwaps([{ kind: 't', solver: 'hub', referral: null, feeBps: null, give: [{ token: 'x', raw: 1n }], get: [{ token: 'y', raw: 1n }], ts: 1 }], usdAt);
  assert.deepEqual([swapRows[0].b, swapRows[0].vol, swapRows[0].np], ['unpriced', 0, 0]);
});

const head = { day: '2026-11-03', fillers: ['hub', 's1'], settlementTxs: 90000, listed: 6, read: 6, hashes: dayTxs.map((x) => x.transaction.hash) };
const file = () => dayFile(head, swaps, usdAt, { decimals: [[USDC, 6]], prices: [['1000|near:x', 1.5]] });

test('a day file is the same bytes every time and reads back clean', () => {
  assert.equal(file(), file());
  assert.equal(dayFile(head, [...swaps].reverse(), usdAt), dayFile(head, swaps, usdAt)); // input order does not matter
  const p = parseDayFile(file(), '2026-11-03');
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.head.swaps, { diff: 1, transfer: 2 });
  assert.equal(p.head.census.digest, digestOf(head.hashes));
  assert.equal(file().includes('user'), false); // no wallet addresses
});

test('parseDayFile finds a tampered count, a wrong day and a day with too few transactions read', () => {
  const bad = file().replace('"diff":1', '"diff":2');
  assert.match(parseDayFile(bad).problems.join(), /diff swaps: header says 2, rows add up to 1/);
  assert.match(parseDayFile(file(), '2026-11-04').problems.join(), /name says 2026-11-04/);
  const thin = dayFile({ ...head, listed: 1000, read: 900 }, swaps, usdAt);
  assert.match(parseDayFile(thin).problems.join(), /only 0.9 of the listed/);
  assert.match(parseDayFile('nope').problems[0], /not JSON/);
});

test('summarizeDays gives per-day totals, the token_diff share and the gaps between frozen days', () => {
  const s = summarizeDays([parseDayFile(file()), parseDayFile(file().replaceAll('2026-11-03', '2026-11-06'))]);
  assert.deepEqual([s.firstDay, s.lastDay, s.gaps], ['2026-11-03', '2026-11-06', ['2026-11-04', '2026-11-05']]);
  const d = s.days[0];
  assert.deepEqual([d.swaps, d.tokenDiffSwaps, d.transferSwaps, d.unpricedSwaps], [3, 1, 2, 0]);
  assert.equal(d.usd, 3005);
  assert.equal(d.tokenDiffShareOfSwaps, 1 / 3);
  assert.deepEqual(d.topReferrals, [{ referral: '1click-lifi', usd: 1000 }]);
  assert.equal(d.solvers, 2);
  assert.deepEqual(gapsBetween(['2026-11-03']), []);
});
