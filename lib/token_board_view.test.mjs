import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenBoardView } from './token_board_view.ts';

const route = (route, status, usd, share) => ({ route, status, swaps: 10, usd, share, swapShare: 0.01 });
const board = {
  from: '2026-10-06', to: '2026-11-04', days: 30, routes: 4519, swaps: 588605, usd: 1e9,
  byStatus: {
    both: { swaps: 391267, usd: 5.5e8, swapShare: 0.665, usdShare: 0.555 },
    one: { swaps: 187174, usd: 4.4e8, swapShare: 0.318, usdShare: 0.445 },
    none: { swaps: 10164, usd: 0, swapShare: 0.017, usdShare: 0 },
  },
  largest: [route('USDT (Tron) to USDT (Ethereum)', 'one', 8.26e7, 0.083), route('ZEC (Zcash) to BTC (NEAR)', 'both', 4.61e7, 0.046)],
  largestOneSide: [route('USDT (Tron) to USDT (Ethereum)', 'one', 8.26e7, 0.083)],
  largestUnpriced: [],
};

test('FR-21 board view: priced shares in the summary, table rows and the largest one-side routes', () => {
  const v = tokenBoardView(board);
  assert.match(v.summary, /Over 30 days \(2026-10-06 to 2026-11-04\), the frozen days hold 588,605 swaps on 4,519 routes/);
  assert.match(v.summary, /67% of the swaps, 56% of the USD, have a price on both sides; only these are costed on Follow the Fee/);
  assert.match(v.summary, /32% have a price on one side/);
  assert.match(v.summary, /1\.7% have no price at all/);
  assert.deepEqual(v.rows, [
    ['USDT (Tron) to USDT (Ethereum)', '$82.6M', '8.3%', 'One side'],
    ['ZEC (Zcash) to BTC (NEAR)', '$46.1M', '4.6%', 'Both sides'],
  ]);
  assert.equal(v.missing, 'USDT (Tron) to USDT (Ethereum) (8.3%)');
});

test('a missing or old-format board file gives null, so the page shows its error banner', () => {
  assert.equal(tokenBoardView(null), null);
  assert.equal(tokenBoardView({ byStatus: { quoted: {} } }), null);
});
