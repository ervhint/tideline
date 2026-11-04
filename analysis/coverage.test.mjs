import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageReport } from './coverage.mjs';

const ts = (day, h = 12) => Date.parse(`${day}T${String(h).padStart(2, '0')}:00:00Z`) / 1000;

test('T-2.2 daily coverage against DefiLlama, including the days that disagree and days DefiLlama lacks', () => {
  const days = [
    { day: '2026-01-01', swaps: [{ ts: ts('2026-01-01'), usdIn: 300, intentHash: 'a' }, { ts: ts('2026-01-01'), usdIn: 100, intentHash: 'b' }] },
    { day: '2026-01-02', swaps: [{ ts: ts('2026-01-02'), usdIn: 900, intentHash: 'c' }] },
    { day: '2026-01-03', swaps: [] },
  ];
  const r = coverageReport(days, new Map([['2026-01-01', 1000], ['2026-01-02', 1000]]));
  assert.deepEqual(r.daily.map((d) => d.coverage), [0.4, 0.9, null]);
  assert.equal(r.overallCoverage, 0.65);
  assert.deepEqual(r.emptyDays, ['2026-01-03']);
  assert.equal(r.byMonth[0].coverage, 0.65);
});

test('T-2.1 a swap pulled twice is counted once, and rows outside their day or without USD are flagged', () => {
  const days = [{ day: '2026-01-01', swaps: [
    { ts: ts('2026-01-01'), usdIn: 10, intentHash: 'a' },
    { ts: ts('2026-01-01'), usdIn: 10, intentHash: 'a' },
    { ts: ts('2026-01-02', 1), usdIn: 5, intentHash: 'b' },
    { ts: ts('2026-01-01'), usdIn: NaN, intentHash: null },
  ] }];
  const r = coverageReport(days, new Map());
  assert.equal(r.duplicates, 1);
  assert.equal(r.rows, 3);
  assert.equal(r.rowsOutsideTheirDay, 1);
  assert.equal(r.rowsWithBadUsd, 1);
  assert.equal(r.noHash, 1);
});
