import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffsOfTx, swapsOfTx, transfersOfTx, withdrawalsOfTx, transferSwaps, feeBps, llamaId, base58Hex, usdOf, sideAgreement, sampleHashes, extrapolate } from './chain_swaps.mjs';

const log = (event, data) => `EVENT_JSON:${JSON.stringify({ standard: 'dip4', version: '0.4.3', event, data })}`;
const tx = (hash, ...logs) => ({ transaction: { hash }, receipts: [{ execution_outcome: { outcome: { logs } } }] });
const USDC = 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near';

const swap = tx('H1',
  log('token_diff', [
    { intent_hash: 'U', account_id: 'user', referral: '1click-swapkit', diff: { [USDC]: '-990000000', 'nep141:wrap.near': '5' }, fees_collected: { [USDC]: '99000' } },
    { intent_hash: 'S', account_id: 'solver.near', diff: { [USDC]: '990000000', 'nep141:wrap.near': '-5' } },
  ]),
  log('transfer', [{ intent_hash: 'F', account_id: 'user', receiver_id: 'fees.near', tokens: { [USDC]: '10000000' } }]),
  log('transfer', [{ intent_hash: 'X', account_id: 'other', receiver_id: 'fees.near', tokens: { [USDC]: '1' } }]),
  'not an event',
);

test('every token_diff entry is read, with its sides and protocol fee', () => {
  const d = diffsOfTx(swap);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0].give, [{ token: USDC, raw: 990000000n }]);
  assert.deepEqual(d[0].get, [{ token: 'nep141:wrap.near', raw: 5n }]);
  assert.deepEqual(d[0].protocolFees, [{ token: USDC, raw: 99000n }]);
  assert.equal(d[1].referral, null);
});

test('a swap is the referred entry; its app fee is the same account\'s transfer in that transaction', () => {
  const [s] = swapsOfTx(swap);
  assert.equal(s.hash, 'H1');
  assert.equal(s.referral, '1click-swapkit');
  assert.deepEqual(s.appFees, [{ recipient: 'fees.near', token: USDC, raw: 10000000n }]);
  assert.equal(swapsOfTx(tx('H2', log('token_diff', [{ account_id: 'a', diff: {} }]))).length, 0);
});

test('transfers and withdrawals are read one row per token', () => {
  assert.deepEqual(transfersOfTx(swap).map((t) => [t.from, t.to, t.raw]), [['user', 'fees.near', 10000000n], ['other', 'fees.near', 1n]]);
  const w = tx('W',
    log('ft_withdraw', [{ account_id: 'u', token: 'eth.omft.near', receiver_id: 'eth.omft.near', amount: '7' }]),
    log('native_withdraw', [{ account_id: 'v', receiver_id: 'v.near', amount: '9' }]),
    log('mt_withdraw', [{ account_id: 'x' }]));
  assert.deepEqual(withdrawalsOfTx(w).map((x) => [x.event, x.account, x.token, x.raw]), [
    ['ft_withdraw', 'u', 'nep141:eth.omft.near', 7n], ['native_withdraw', 'v', 'nep141:wrap.near', 9n], ['mt_withdraw', 'x', null, 0n]]);
});

test('a transfer swap pairs tokens sent to a solver with a different token back, across transactions', () => {
  const t = (from, to, token, raw) => ({ from, to, token, raw });
  const day = [
    { hash: 'A', ts: 10, transfers: [t('u1', 'hub', 'eth', 5n), t('u1', 'fees', 'eth', 1n)] },
    { hash: 'B', ts: 20, transfers: [t('hub', 'u1', 'sol', 9n), t('hub', 'u2', 'eth', 3n), t('u3', 'hub', 'eth', 2n)] },
    { hash: 'C', ts: 30, transfers: [t('u2', 'hub', 'eth', 3n), t('hub', 'u4', 'sol', 1n), t('u4', 'hub', 'eth', 1n)] },
  ];
  const s = transferSwaps(day, new Set(['hub']));
  // u1: eth in, sol back. u2: eth both ways is a refund, not a swap. u3: nothing back. u4: counted.
  assert.deepEqual(s.map((x) => [x.user, x.solver, x.ts, x.hashes]), [['u1', 'hub', 10, ['A', 'B']], ['u4', 'hub', 30, ['C']]]);
  assert.deepEqual(s[0].give, [{ token: 'eth', raw: 5n }]);
  assert.deepEqual(s[0].get, [{ token: 'sol', raw: 9n }]);
  assert.deepEqual(transferSwaps(day, new Set(['hub']), new Set(['u1', 'u4'])), []);
});

test('app fee bps is fee over everything the user gave', () => {
  const [s] = swapsOfTx(swap);
  assert.equal(feeBps(s), 100);
  assert.equal(feeBps(s, 'fees.near'), 100);
  assert.equal(feeBps(s, 'nobody'), null);
  assert.equal(feeBps({ ...s, appFees: [] }), 0);
  assert.equal(feeBps({ ...s, appFees: [{ recipient: 'f', token: 'nep141:wrap.near', raw: 1n }] }), null);
});

test('token ids map to DefiLlama ids only when the mapping is sure', () => {
  assert.equal(llamaId('nep141:wrap.near'), 'coingecko:near');
  assert.equal(llamaId(USDC), 'ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  assert.equal(llamaId('nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near'), 'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  assert.equal(llamaId('nep141:btc.omft.near'), 'coingecko:bitcoin');
  assert.equal(llamaId('nep141:usdt.tether-token.near'), 'near:usdt.tether-token.near');
  assert.equal(llamaId('nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near'), null);
  assert.equal(llamaId('nep141:xyz.omft.near'), null);
  assert.equal(llamaId('nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g'), 'bsc:0x55d398326f99059ff775485246999027b3197955');
  assert.equal(llamaId('nep245:v2_1.omni.hot.tg:56_11111111111111111111'), 'coingecko:binancecoin');
  assert.equal(llamaId('nep245:v2_1.omni.hot.tg:1117_3tsdfyziyc7EJbP2aULWSKU4toBaAcN4FdTgfm5W1mC4ouR'), null);
  assert.equal(llamaId('nep245:other.near:56_2CMMyVTGZkeyNZTSvS5sarzfir6g'), null);
});

test('base58 decodes to hex, keeping leading zero bytes', () => {
  assert.equal(base58Hex('11'), '0000');
  assert.equal(base58Hex('1z'), '0039');
  assert.equal(base58Hex('0OIl'), null);
});

test('side agreement is what the user got over what they gave, in USD', () => {
  const s = { give: [{ token: 'a', raw: 100n }], get: [{ token: 'b', raw: 99n }] };
  assert.equal(sideAgreement(s, () => 1, () => 0), 0.99);
  assert.equal(sideAgreement(s, (t) => (t === 'a' ? 1 : null), () => 0), null);
  assert.equal(sideAgreement({ ...s, get: [] }, () => 1, () => 0), null);
});

test('USD of a side needs a price and decimals for every token on it', () => {
  const side = [{ token: 'a', raw: 2_500_000n }, { token: 'b', raw: 10n ** 18n }];
  const price = { a: 1, b: 3 }, dec = { a: 6, b: 18 };
  assert.equal(usdOf(side, (t) => price[t], (t) => dec[t]), 5.5);
  assert.equal(usdOf(side, (t) => (t === 'a' ? 1 : null), (t) => dec[t]), null);
  assert.equal(usdOf([], () => 1, () => 1), 0);
});

test('the seeded sample is the same for any order of the list, and changes with the seed', () => {
  const hashes = Array.from({ length: 50 }, (_, i) => `h${i}`);
  const a = sampleHashes(hashes, 10, '2026-11-03');
  assert.deepEqual(sampleHashes([...hashes].reverse(), 10, '2026-11-03'), a);
  assert.notDeepEqual(sampleHashes(hashes, 10, '2026-11-04'), a);
  assert.equal(new Set(a).size, 10);
});

test('extrapolation scales the sample mean and narrows to nothing for a full census', () => {
  const e = extrapolate([0, 2, 4], 30);
  assert.equal(e.total, 60);
  assert.ok(e.lo < 60 && e.hi > 60);
  assert.deepEqual(extrapolate([1, 3], 2), { total: 4, lo: 4, hi: 4 });
  assert.equal(extrapolate([], 10).total, null);
});
