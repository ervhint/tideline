import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solversOfSwap, solverConcentration } from './solvers.mjs';

const log = (event, data) => `EVENT_JSON:${JSON.stringify({ standard: 'dip4', version: '0.4.3', event, data })}`;
const tx = (...logs) => ({ receipts: [{ execution_outcome: { outcome: { logs } } }] });

test('E3 the solver is the token_diff account whose intent is not the user\'s', () => {
  const t = tx(
    log('token_diff', [{ intent_hash: 'S1', account_id: 'kipseli.near', diff: {} }]),
    log('transfer', [{ intent_hash: 'X', account_id: 'someone', receiver_id: 'b' }]),
    log('token_diff', [{ intent_hash: 'U1', account_id: 'user-deposit', diff: {} }]),
    'plain log line',
  );
  assert.deepEqual(solversOfSwap([t], new Set(['U1'])), ['kipseli.near']);
  assert.deepEqual(solversOfSwap([tx(log('token_diff', [{ intent_hash: 'U1', account_id: 'user' }]))], new Set(['U1'])), []);
});

test('E3 a transfer fill: the account that took the user token and sent a different one back, across transactions', () => {
  const t1 = tx(log('transfer', [{ intent_hash: 'A', account_id: 'user', receiver_id: 'hub', tokens: { eth: '5' } }]));
  const t2 = tx(
    log('transfer', [{ intent_hash: 'B', account_id: 'hub', receiver_id: 'user', tokens: { sol: '9' } }]),
    log('transfer', [{ intent_hash: 'C', account_id: 'gas', receiver_id: 'user', tokens: { wnear: '1' } }]),
    log('transfer', [{ intent_hash: 'D', account_id: 'user', receiver_id: 'fees', tokens: { sol: '1' } }]),
  );
  assert.deepEqual(solversOfSwap([t1, t2], new Set(['X'])), ['hub']);
  // The hub's payout listed first must not turn the user into the solver.
  assert.deepEqual(solversOfSwap([t1, t2], new Set(['A'])), ['hub']);
});

const bucket = (sampled, usd, solvers) => ({ sampled, usd, resolved: sampled, unresolvedUsd: 0, solvers });
const empty = () => bucket(0, 0, {});
const day = (d, small, big, smallUsd, bigUsd) => ({
  day: d,
  totals: { '0-1k': { usd: smallUsd }, '1k-10k': { usd: 0 }, '10k-100k': { usd: 0 }, '100k+': { usd: bigUsd } },
  perBucket: { '0-1k': small, '1k-10k': empty(), '10k-100k': empty(), '100k+': big },
});

test('E3 per-size HHI and top 3, and all sizes weighted by each bucket\'s real USD', () => {
  const d = day('2026-11-01', bucket(2, 200, { a: 100, b: 100 }), bucket(2, 2e6, { c: 2e6 }), 1e6, 9e6);
  const r = solverConcentration([d]);
  assert.equal(r.bySize['0-1k'].hhi, 5000);
  assert.equal(r.bySize['100k+'].hhi, 10000);
  assert.equal(r.bySize['100k+'].top3, 1);
  // all sizes: a 5%, b 5%, c 90%
  assert.ok(Math.abs(r.allSizes.top3 - 1) < 1e-12);
  assert.ok(Math.abs(r.allSizes.hhi - (25 + 25 + 8100)) < 1e-6);
  assert.equal(r.allSizes.top[0].account, 'c');
});

test('E3 days are pooled, and an empty bucket gives no number rather than zero', () => {
  const r = solverConcentration([day('a', bucket(1, 100, { a: 100 }), empty(), 1, 0), day('b', bucket(1, 100, { b: 100 }), empty(), 1, 0)]);
  assert.equal(r.bySize['0-1k'].hhi, 5000);
  assert.equal(r.bySize['100k+'].hhi, null);
  assert.deepEqual(r.days, ['a', 'b']);
});
