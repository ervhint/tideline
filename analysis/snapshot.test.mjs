import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, dayRows, nearFeeRows, tokenRows } from './snapshot.mjs';

test('size buckets use usdIn edges', () => {
  assert.deepEqual([999.99, 1000, 9999, 10000, 99999, 100000].map(bucketOf), ['0-1k', '1k-10k', '1k-10k', '10k-100k', '10k-100k', '100k+']);
});

test('dayRows groups by referral, total fee and bucket, sums swaps and USD', () => {
  const swaps = [
    { referral: 'a', appFees: [{ fee: 20 }, { fee: 5 }], usdIn: 100, usdOut: 99 },
    { referral: 'a', appFees: [{ fee: 25 }], usdIn: 200, usdOut: 198 },
    { referral: null, appFees: [], usdIn: 5000, usdOut: 4990 },
  ];
  assert.deepEqual(dayRows('2026-01-01', swaps), [
    '2026-01-01,,0,1k-10k,1,5000.00,4990.00',
    '2026-01-01,a,25,0-1k,2,300.00,297.00',
  ]);
});

test('FR-21 token rows: swaps and USD per route, no wallets', () => {
  const swaps = [
    { from: 'nep141:eth.omft.near', to: 'nep141:wrap.near', usdIn: 100, recipient: '0xabc' },
    { from: 'nep141:eth.omft.near', to: 'nep141:wrap.near', usdIn: 50 },
    { from: 'nep141:btc.omft.near', to: 'nep141:eth.omft.near', usdIn: 1000 },
  ];
  assert.deepEqual(tokenRows('2026-10-01', swaps), [
    '2026-10-01,nep141:btc.omft.near,nep141:eth.omft.near,1,1000.00',
    '2026-10-01,nep141:eth.omft.near,nep141:wrap.near,2,150.00',
  ]);
});

test('FR-05 near fee rows: app fees per bucket and the part paid to NEAR wallets', () => {
  const swaps = [
    { usdIn: 500, appFees: [{ recipient: 'buybacks.multisignature.near', fee: 20 }] },
    { usdIn: 5000, appFees: [{ recipient: 'swapkit.near', fee: 50 }, { recipient: 'buybacks.multisignature.near', fee: 5 }] },
  ];
  assert.deepEqual(nearFeeRows('2026-10-01', swaps, ['buybacks.multisignature.near']), [
    '2026-10-01,0-1k,1,500.00,1.00,1.00',
    '2026-10-01,1k-10k,1,5000.00,27.50,2.50',
  ]);
});
