import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenBoardView } from './token_board_view.ts';

const board = {
  from: '2026-10-04', to: '2026-11-02', days: 30, routes: 1234, swaps: 500000, usd: 2.5e9,
  byStatus: {
    quoted: { routes: 4, swaps: 10000, usd: 1e8, share: 0.04 },
    similar: { routes: 20, swaps: 40000, usd: 4e8, share: 0.16 },
    'not quoted': { routes: 1210, swaps: 450000, usd: 2e9, share: 0.8 },
  },
  largest: [
    { route: 'USDT (eth) to USDC (eth)', status: 'not quoted', swaps: 9000, usd: 3e8, share: 0.12 },
    { route: 'ETH (eth) to USDC (eth)', status: 'quoted', swaps: 5000, usd: 6e7, share: 0.024 },
  ],
  largestNotQuoted: [{ route: 'USDT (eth) to USDC (eth)', status: 'not quoted', swaps: 9000, usd: 3e8, share: 0.12 }],
};

test('FR-21 board view: summary sentence, table rows and the largest missing routes', () => {
  const v = tokenBoardView(board);
  assert.match(v.summary, /Over 30 days \(2026-10-04 to 2026-11-02\), 1Click moved \$2\.50B on 1,234 routes/);
  assert.match(v.summary, /carry 4\.0% of it/);
  assert.match(v.summary, /other chains carry 16%/);
  assert.match(v.summary, /other 80% is not quoted/);
  assert.deepEqual(v.rows, [
    ['USDT (eth) to USDC (eth)', '$300.0M', '12%', 'Not quoted'],
    ['ETH (eth) to USDC (eth)', '$60.0M', '2.4%', 'Quoted'],
  ]);
  assert.equal(v.missing, 'USDT (eth) to USDC (eth) (12%)');
});

test('no published board gives no view', () => {
  assert.equal(tokenBoardView(null), null);
});
