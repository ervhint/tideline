import test from 'node:test';
import assert from 'node:assert/strict';
import { chainOf, tokenLabel, tokenPriced, coverageBoard } from './token_coverage.mjs';

const USDC = 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near';
const ETH = 'nep141:eth.omft.near';
const TRON_USDT = 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near'; // no DefiLlama mapping
const ZEC = 'nep141:zec.omft.near';

const day = (d, routes, priced = ['ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'coingecko:ethereum']) => ({
  head: { day: d }, routes, priceIds: new Set(priced), decimals: { [USDC]: 6, [ETH]: 18, [TRON_USDT]: 6, [ZEC]: 8 },
});

test('chain of a token from its id', () => {
  assert.equal(chainOf(USDC), 'eth');
  assert.equal(chainOf(TRON_USDT), 'tron');
  assert.equal(chainOf('nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near'), 'sol');
  assert.equal(chainOf('nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near'), 'eth');
  assert.equal(chainOf('nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g'), 'bsc');
  assert.equal(chainOf('nep141:wrap.near'), 'near');
});

test('label: ft_metadata symbol when known, else the shortened contract, always with the chain', () => {
  assert.equal(tokenLabel(USDC, { [USDC]: { symbol: 'USDC' } }), 'USDC (Ethereum)');
  assert.equal(tokenLabel(TRON_USDT), 'tron-d28…f015 (Tron)');
  assert.equal(tokenLabel('nep141:wrap.near'), 'wrap.near (NEAR)');
});

test('a token is priced only with a DefiLlama id the day holds a price for, and decimals', () => {
  const d = day('2026-11-01', []);
  assert.equal(tokenPriced(d, USDC), true);
  assert.equal(tokenPriced(d, TRON_USDT), false); // no mapping
  assert.equal(tokenPriced(d, ZEC), false); // mapped, but no price that day
  assert.equal(tokenPriced({ ...d, decimals: {} }, USDC), false);
});

test('FR-21 board: swaps and USD by how many sides are priced, largest routes, summed over days', () => {
  const b = coverageBoard([
    day('2026-11-01', [{ from: ETH, to: USDC, n: 2, vol: 300 }, { from: TRON_USDT, to: USDC, n: 1, vol: 600 }]),
    day('2026-11-02', [{ from: ETH, to: USDC, n: 1, vol: 100 }, { from: TRON_USDT, to: ZEC, n: 4, vol: 0 }]),
  ], { [USDC]: { symbol: 'USDC' }, [ETH]: { symbol: 'ETH' } });
  assert.equal(b.days, 2); assert.equal(b.from, '2026-11-01'); assert.equal(b.routes, 3);
  assert.deepEqual([b.byStatus.both.swaps, b.byStatus.one.swaps, b.byStatus.none.swaps], [3, 1, 4]);
  assert.equal(b.byStatus.both.usdShare, 0.4);
  assert.equal(b.byStatus.none.swapShare, 0.5);
  assert.equal(b.largest[0].route, 'tron-d28…f015 (Tron) to USDC (Ethereum)');
  assert.equal(b.largest[1].route, 'ETH (Ethereum) to USDC (Ethereum)');
  assert.equal(b.largest[1].usd, 400);
  assert.equal(b.largestOneSide.length, 1);
  assert.equal(b.largestUnpriced[0].swaps, 4);
});
