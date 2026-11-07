import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TREASURY, treasuryShare, treasuryTransfers, flowRows, treasuryFile, parseTreasuryFile, confidentialDoc } from './treasury.mjs';

const swap = (solver, vol, o = {}) => ({ t: 'swap', k: solver === TREASURY ? 't' : 'd', solver, ref: '', fee: null, b: '1k-10k', n: 1, np: 1, vol, in: vol, out: vol, ...o });
const day = (d, swaps) => ({ head: { day: d }, swaps });
const tr = (from, to, token, raw, ts = 3600) => ({ from, to, token, raw, ts });
const usdAt = (_, side) => (side[0].token === 'unpriced' ? null : Number(side[0].raw));
const file = (d, flows) => ({ head: { day: d, transfers: { all: 0, unpriced: 3 } }, flows, problems: [] });
const flow = (dir, who, usd) => ({ t: 'flow', dir, who, token: 'x', n: 1, np: 1, raw: '1', usd });

test('A2 rule 1: treasury share is treasury USD over the USD of all groups, across the days given', () => {
  const s = treasuryShare([day('a', [swap(TREASURY, 75), swap('s1', 25)]), day('b', [swap('s1', 100)])]);
  assert.deepEqual(s, { days: 2, usd: 75, allUsd: 200, share: 0.375 });
  assert.equal(treasuryShare([day('a', [])]).share, null);
});

test('A2 rule 8: only transfers between the treasury and another account count', () => {
  const rows = [{ ts: 7, transfers: [tr('u', TREASURY, 'a', 1n), tr(TREASURY, 'u', 'b', 2n), tr('u', 'v', 'a', 3n), tr(TREASURY, TREASURY, 'a', 4n)] }];
  assert.deepEqual(treasuryTransfers(rows).map((t) => [t.from, t.to, t.ts]), [['u', TREASURY, 7], [TREASURY, 'u', 7]]);
});

test('A2 rule 8: sums by token and direction, listed fillers apart from other accounts; unpriced amounts are counted, never guessed', () => {
  const rows = flowRows([
    tr('u1', TREASURY, 'a', 10n), tr('u2', TREASURY, 'a', 5n), tr('s1', TREASURY, 'a', 7n),
    tr(TREASURY, 'u1', 'b', 12n), tr(TREASURY, 's1', 'b', 3n), tr('u1', TREASURY, 'unpriced', 9n),
  ], new Set(['s1', TREASURY]), usdAt);
  const at = (dir, who, token) => rows.find((r) => r.dir === dir && r.who === who && r.token === token);
  assert.deepEqual(at('in', 'other', 'a'), { t: 'flow', dir: 'in', who: 'other', token: 'a', n: 2, np: 2, raw: '15', usd: 15 });
  assert.equal(at('in', 'filler', 'a').usd, 7);
  assert.equal(at('out', 'other', 'b').usd, 12);
  assert.equal(at('out', 'filler', 'b').usd, 3);
  assert.deepEqual(at('in', 'other', 'unpriced'), { t: 'flow', dir: 'in', who: 'other', token: 'unpriced', n: 1, np: 0, raw: '9', usd: 0 });
});

const META = { day: '2026-11-05', fillers: ['s1', TREASURY], readShare: 1, hashes: ['h1', 'h2'] };
const TRANSFERS = [tr('wallet-of-a-user.near', TREASURY, 'a', 10n), tr(TREASURY, 'wallet-of-a-user.near', 'unpriced', 9n)];

test('A2 rule 8: a treasury file reads back clean, is the same bytes every time, and holds no wallet address', () => {
  const text = treasuryFile(META, TRANSFERS, usdAt, { decimals: [['a', 6]], prices: [['3600|near:x', 2]] });
  assert.equal(text, treasuryFile(META, TRANSFERS, usdAt, { decimals: [['a', 6]], prices: [['3600|near:x', 2]] }));
  assert.ok(!text.includes('wallet-of-a-user'));
  assert.ok(!text.includes('"s1"'));
  const p = parseTreasuryFile(text, '2026-11-05');
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.head.transfers, { all: 2, unpriced: 1 });
  assert.equal(p.flows.length, 2);
});

test('a damaged treasury file is caught', () => {
  const text = treasuryFile(META, TRANSFERS, usdAt);
  assert.match(parseTreasuryFile(text, '2026-11-06').problems[0], /name says 2026-11-06/);
  assert.match(parseTreasuryFile(text.replace('"n":1', '"n":5')).problems[0], /rows add up to/);
  assert.match(parseTreasuryFile(treasuryFile({ ...META, readShare: 0.5 }, TRANSFERS, usdAt)).problems[0], /of the listed transactions were read/);
  assert.match(parseTreasuryFile('{"t":"day"}').problems[0], /not the treasury header/);
  assert.match(parseTreasuryFile('nope').problems[0], /not JSON/);
});

test('A2 rule 8: confidential share is other accounts in ÷ (that + USD of all groups not through the treasury), filler USD left out', () => {
  // Other accounts in 300, public 100: 300 / 400. The fillers' 900 is liquidity, not user flow.
  const d = confidentialDoc([day('2026-11-05', [swap(TREASURY, 50), swap('s1', 100)])], new Map([['2026-11-05', file('2026-11-05', [flow('in', 'other', 300), flow('in', 'filler', 900), flow('out', 'other', 280)])]]));
  const r = d.perDay[0];
  assert.equal(r.confidentialShare, 0.75);
  assert.equal(r.fillerIn, 900);
  assert.equal(r.otherOut, 280);
  assert.equal(r.publicUsd, 100);
  assert.ok(Math.abs(r.treasuryShare - 1 / 3) < 1e-12);
  assert.equal(r.unpricedTransfers, 3);
  assert.equal(d.last7.confidentialShare, 0.75);
});

test('A2 rule 7: treasury groups count as paired flows; a day with no file keeps its treasury share and shows as missing', () => {
  const days = [day('2026-11-01', [swap(TREASURY, 50, { n: 4 }), swap('s1', 50, { n: 9 })]), day('2026-11-03', [swap(TREASURY, 100, { n: 2 }), swap('s1', 100)])];
  const d = confidentialDoc(days, new Map([['2026-11-03', file('2026-11-03', [flow('in', 'other', 100)])]]));
  assert.deepEqual(d.perDay.map((r) => r.pairedFlows), [4, 2]);
  assert.deepEqual(d.perDay.map((r) => r.read), [false, true]);
  assert.equal(d.perDay[0].confidentialShare, null);
  assert.equal(d.perDay[0].treasuryShare, 0.5);
  assert.deepEqual(d.missingDays, ['2026-11-01']);
  assert.deepEqual(d.chainGaps, ['2026-11-02']);
  // The window's treasury share uses both days; its confidential share only the day with a file, and says so.
  assert.equal(d.last7.treasuryShare, 0.5);
  assert.equal(d.last7.days, 2);
  assert.equal(d.last7.daysRead, 1);
  assert.equal(d.last7.confidentialShare, 0.5);
});

test('with no treasury file at all the confidential share is null, not 0', () => {
  const d = confidentialDoc([day('2026-11-01', [swap('s1', 50)])], new Map());
  assert.equal(d.last7.confidentialShare, null);
  assert.equal(d.last7.treasuryShare, 0);
  assert.equal(d.last30.daysRead, 0);
});

test('windows hold only the last 7 and 30 days', () => {
  const days = Array.from({ length: 31 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, '0')}`, [swap(i < 24 ? 's1' : TREASURY, 10)]));
  const d = confidentialDoc(days, new Map());
  assert.equal(d.last7.from, '2026-10-25');
  assert.equal(d.last7.treasuryShare, 1);
  assert.equal(d.last30.from, '2026-10-02');
  assert.equal(d.last30.days, 30);
  assert.ok(Math.abs(d.last30.treasuryShare - 7 / 30) < 1e-12);
});
