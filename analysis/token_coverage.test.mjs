import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageBoard, routeStatus } from './token_coverage.mjs';

const USDC = 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near';
const names = {
  'nep141:eth.omft.near': { symbol: 'ETH', chain: 'eth' },
  'nep141:arb.omft.near': { symbol: 'ETH', chain: 'arb' },
  [USDC]: { symbol: 'USDC', chain: 'eth' },
  'nep141:base-usdc': { symbol: 'USDC', chain: 'base' },
  'nep141:zec.omft.near': { symbol: 'ZEC', chain: 'zec' },
};

test('route status: exact route, same tokens on other chains, or not quoted', () => {
  assert.equal(routeStatus('nep141:eth.omft.near', USDC, names), 'quoted');
  assert.equal(routeStatus('nep141:arb.omft.near', 'nep141:base-usdc', names), 'similar');
  assert.equal(routeStatus('nep141:zec.omft.near', USDC, names), 'not quoted');
  assert.equal(routeStatus(USDC, 'nep141:eth.omft.near', names), 'not quoted'); // the other direction is not sampled
  assert.equal(routeStatus('nep141:unknown', USDC, names), 'not quoted');
  const btc = { ...names, '1cs_v1:btc:native:coin': { symbol: 'BTC(OMNI)', chain: 'btc' }, 'nep141:btc.omft.near': { symbol: 'BTC', chain: 'btc' } };
  assert.equal(routeStatus('1cs_v1:btc:native:coin', USDC, btc), 'quoted');
  assert.equal(routeStatus('1cs_v1:btc:native:coin', 'nep141:base-usdc', btc), 'similar'); // "BTC(OMNI)" counts as BTC
  assert.equal(routeStatus('nep141:btc.omft.near', USDC, btc), 'similar'); // the old id is no longer sampled
});

test('FR-21 coverage board: shares by status and largest routes, summed over days', () => {
  const rows = [
    { day: '2026-10-01', from: 'nep141:eth.omft.near', to: USDC, swaps: 2, usd: 300 },
    { day: '2026-10-02', from: 'nep141:eth.omft.near', to: USDC, swaps: 1, usd: 100 },
    { day: '2026-10-01', from: 'nep141:arb.omft.near', to: 'nep141:base-usdc', swaps: 1, usd: 100 },
    { day: '2026-10-02', from: 'nep141:zec.omft.near', to: USDC, swaps: 5, usd: 500 },
  ];
  const b = coverageBoard(rows, names, { top: 2 });
  assert.equal(b.days, 2);
  assert.equal(b.usd, 1000);
  assert.equal(b.byStatus.quoted.share, 0.4);
  assert.equal(b.byStatus.similar.share, 0.1);
  assert.equal(b.byStatus['not quoted'].share, 0.5);
  assert.deepEqual(b.largest.map((x) => x.route), ['ZEC (zec) to USDC (eth)', 'ETH (eth) to USDC (eth)']);
  assert.deepEqual(b.largestNotQuoted.map((x) => [x.route, x.swaps]), [['ZEC (zec) to USDC (eth)', 5]]);
});
