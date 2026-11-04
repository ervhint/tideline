import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorPanel, dayState, FAILED_PANEL } from './attest_view.ts';

const A = 'a'.repeat(60) + '1234';
const B = 'b'.repeat(60) + '5678';
const URL = 'https://example.test/contract';
// 2026-11-02T09:34:18Z in nanoseconds, too large for a plain number.
const record = (hash) => ({ archive_sha256: hash, readings: '', block_timestamp: '1793612058603540814' });
const good = (day) => ({ day, local: A, record: record(A) });

test('dayState covers all four cases', () => {
  assert.equal(dayState({ day: 'd', local: A, record: null }), 'none');
  assert.equal(dayState(good('d')), 'anchored');
  assert.equal(dayState({ day: 'd', local: B, record: record(A) }), 'mismatch');
  assert.equal(dayState({ day: 'd', local: null, record: record(A) }), 'no-file');
});

test('no records reads as not yet anchored', () => {
  const p = anchorPanel([{ day: '2026-11-01', local: A, record: null }], URL);
  assert.equal(p.state, 'none');
  assert.equal(p.tag, 'Not Yet Anchored');
});

test('all matching shows the latest day and when it was recorded', () => {
  const p = anchorPanel([good('2026-11-01'), good('2026-10-30'), { day: '2026-11-02', local: A, record: null }], URL);
  assert.equal(p.state, 'anchored');
  assert.equal(p.tag, 'Anchored: 1 Nov 2026');
  assert.equal(p.day, '2026-11-01');
  assert.equal(p.archive, 'aaaa…1234');
  assert.match(p.text, /recorded on 2 Nov 2026 at 09:34 UTC/);
  assert.match(p.text, /2 days recorded/);
});

test('a mismatch on an older day outranks a good latest day and names the day', () => {
  const p = anchorPanel([{ day: '2026-10-30', local: B, record: record(A) }, good('2026-11-01')], URL);
  assert.equal(p.state, 'mismatch');
  assert.equal(p.tag, 'Mismatch: 30 Oct 2026');
  assert.equal(p.archive, 'bbbb…5678');
  assert.equal(p.chain, 'aaaa…1234');
});

test('a record whose file is missing cannot be called anchored', () => {
  assert.deepEqual(anchorPanel([{ day: '2026-11-01', local: null, record: record(A) }], URL), FAILED_PANEL);
});
