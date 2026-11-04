import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRows } from './reconcile_view.ts';

const inputs = {
  vstar: { priceUsd: 3.81, at16: { mid: 13.7e9 } },
  buybackShare: 1,
  fees: [
    { day: '2026-02-22', fees: 5, revenue: 1e6 }, // before the buyback start: not counted
    { day: '2026-02-23', fees: 5, revenue: 2e6 },
    { day: '2026-10-18', fees: 5, revenue: 4.68e6 },
    { day: '2026-10-19', fees: 5, revenue: 9e6 }, // after the article date: not counted
  ],
  volume: [
    { day: '2025-09-01', defillama: 10e9 },
    { day: '2026-09-21', defillama: 19.5e9 },
    { day: '2026-09-22', defillama: 1e9 }, // after the cut-off: not counted
  ],
};

test('T-9.1 every row has a source, a value, a date and our value', () => {
  const rows = reconcileRows(inputs);
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.ok(r.ours && r.ours !== 'Not available');
    assert.ok(r.others.length >= 1);
    for (const o of r.others) assert.ok(o.name && o.value && o.date);
  }
});

test('T-9.1 our sums stop on the same day as the source they are compared with', () => {
  const rows = reconcileRows(inputs);
  assert.match(rows[2].ours, /\$6\.68M of revenue/);
  assert.match(rows[3].ours, /^\$29\.5B/);
});

test('T-9.1 with the files missing, our cells say so instead of showing old numbers', () => {
  const rows = reconcileRows({ vstar: null, buybackShare: null, fees: [], volume: [] });
  assert.equal(rows[0].ours, 'Not available');
  assert.equal(rows[2].ours, 'Not available');
  assert.equal(rows[3].ours, 'Not available');
});
