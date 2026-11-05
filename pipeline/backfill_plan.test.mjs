import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, plan, PER_JOB } from './backfill_plan.mjs';

test('daysBetween lists every day, both ends included, across a month end', () => {
  assert.deepEqual(daysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(daysBetween('2026-11-02', '2026-11-02'), ['2026-11-02']);
});

test('daysBetween refuses bad input', () => {
  assert.throws(() => daysBetween('2026-11-03', '2026-11-02'), /before/);
  assert.throws(() => daysBetween('2026-02-30', '2026-03-02'), /YYYY-MM-DD/);
  assert.throws(() => daysBetween('yesterday', '2026-03-02'), /YYYY-MM-DD/);
  assert.throws(() => daysBetween('2026-01-01', '2026-06-01'), /may hold/);
});

test('30 days, 4 Oct to 2 Nov, make 10 jobs of 3 days with no day twice and none missing', () => {
  const { include } = plan('2026-10-04', '2026-11-02');
  assert.equal(include.length, 10);
  assert.equal(include[0].days, '2026-10-04 2026-10-05 2026-10-06');
  assert.equal(include[9].days, '2026-10-31 2026-11-01 2026-11-02');
  const all = include.flatMap((j) => j.days.split(' '));
  assert.deepEqual(all, daysBetween('2026-10-04', '2026-11-02'));
  assert.deepEqual(include.map((j) => j.job), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('the last job holds the rest, and a job never holds more than PER_JOB days', () => {
  const { include } = plan('2026-10-01', '2026-10-07');
  assert.deepEqual(include.map((j) => j.days.split(' ').length), [3, 3, 1]);
  assert.throws(() => plan('2026-10-01', '2026-10-07', PER_JOB + 1), /a job holds/);
  assert.throws(() => plan('2026-10-01', '2026-10-07', 0), /a job holds/);
});
