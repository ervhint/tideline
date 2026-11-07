import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainChecksView } from './chain_checks_view.ts';

const d = (day, listed, read, swaps = 100, unpricedSwaps = 2) => ({ day, swaps, unpricedSwaps, census: { listed, read } });

test('AC-2.3 chain checks: newest days first, extra reads named, summary over every day', () => {
  const v = chainChecksView({ days: [d('2026-11-01', 1000, 1000), d('2026-11-02', 2000, 2001), d('2026-11-03', 3000, 3000, 1234, 5)], gaps: [] }, 2);
  assert.deepEqual(v.rows, [
    ['2026-11-03', '3,000', '3,000', '1,234', '5', 'Nothing.'],
    ['2026-11-02', '2,000', '2,001', '100', '2', '1 more read than listed: FastNEAR sent one twice. Kept in this frozen day; new days drop them.'],
  ]);
  assert.match(v.summary, /^3 frozen days, 2026-11-01 to 2026-11-03, no gaps\. Every day read every listed transaction\. On 1 day a few more were read than listed \(2026-11-02: 1\)\. The newest 2 days are shown\. Swaps through the Confidential Intents treasury count as paired confidential flows, which are not a full count of private swaps\.$/);
});

test('gaps are named, and a missing file gives null', () => {
  const v = chainChecksView({ days: [d('2026-11-01', 10, 10), d('2026-11-03', 10, 10)], gaps: ['2026-11-02'] });
  assert.match(v.summary, /1 gap \(2026-11-02\)/);
  assert.equal(chainChecksView(null), null);
});
