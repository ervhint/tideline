import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feePaid, largestShare, integratorShares } from './integrator.mjs';

const row = (o) => ({ t: 'swap', k: 'd', solver: 's1', ref: '1click-lifi', fee: 20, b: '1k-10k', n: 1, np: 1, vol: 9980, in: 9980, out: 9900, ...o });
const day = (d, swaps) => ({ head: { day: d }, swaps });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('A1 fee paid: app fee on the gross input; null fee and no price pay nothing', () => {
  near(feePaid(row({})), 20); // 9980 × 20 / 9980
  assert.equal(feePaid(row({ fee: null })), 0);
  assert.equal(feePaid(row({ vol: 0 })), 0);
});

test('A1 largest: 1click-unknown and blank count in the total but are never the largest', () => {
  const r = largestShare([
    row({ ref: '1click-unknown', vol: 99800 }), // fee 200
    row({ ref: '', vol: 49900 }), // fee 100
    row({ ref: '1click-lifi', vol: 9980 }), // fee 20
    row({ ref: '1click-swapkit', vol: 29940 }), // fee 60
  ]);
  assert.equal(r.referral, '1click-swapkit');
  near(r.share, 60 / 380);
  near(r.shareOfNamed, 60 / 80);
  assert.equal(largestShare([row({ ref: '1click-unknown' })]), null);
  assert.equal(largestShare([]), null);
});

test('A1 window: token_diff only, size buckets apart, unreadable fees counted', () => {
  const s = integratorShares([
    day('2026-11-01', [row({ ref: 'a', vol: 9980 }), row({ k: 't', ref: '', fee: null, vol: 30000 }), row({ ref: 'b', fee: null, vol: 500, n: 3 })]),
    day('2026-11-02', [row({ ref: 'b', b: '0-1k', vol: 998 })]),
  ]);
  assert.deepEqual(s.days, ['2026-11-01', '2026-11-02']);
  assert.equal(s.largest.referral, 'a');
  near(s.largest.share, 20 / 22);
  near(s.tokenDiffShareOfUsd, (9980 + 500 + 998) / (9980 + 30000 + 500 + 998));
  assert.deepEqual(s.feeUnreadable, { groups: 1, swaps: 3, usd: 500 });
  assert.equal(s.bySize['0-1k'].referral, 'b');
  assert.equal(s.bySize['100k+'], null);
});
