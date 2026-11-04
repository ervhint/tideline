import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshness } from './status_view.ts';

const now = new Date('2026-11-03T12:00:00Z');

test('NFR-6 fresh: yesterday frozen', () => {
  assert.equal(freshness('2026-11-02', now).stale, false);
});

test('NFR-6 the day before yesterday frozen still counts as on time (GitHub runs late)', () => {
  assert.equal(freshness('2026-11-01', now).stale, false);
});

test('NFR-6 late: the last frozen day is three days back, and the banner says which day', () => {
  const f = freshness('2026-10-31', now);
  assert.equal(f.stale, true);
  assert.equal(f.title, 'Data Is Late');
  assert.match(f.body, /31 Oct 2026/);
});

test('NFR-6 nothing readable reads as late, never as fresh', () => {
  const f = freshness(null, now);
  assert.equal(f.stale, true);
  assert.match(f.body, /No finished day/);
});
