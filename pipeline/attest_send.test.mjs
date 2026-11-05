import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedDays, readingsFor, sendPending, FIRST_DAY_WITH_READINGS } from './attest_send.mjs';

const HASH = 'a'.repeat(64);
const THESIS = {
  asOf: '2026-11-01T10:33:58.902Z',
  readings: [{ id: 'Q1', side: 'Neutral' }, { id: 'Q3', side: 'Not Measured' }],
  verdict: { verdict: 'Bullish', score: 3 },
};

// A contract stand-in: send stores a record, view reads it.
function chain(initial = {}) {
  const records = { ...initial };
  const sent = [];
  return {
    sent,
    records,
    view: async (day) => records[day] ?? null,
    send: (args) => {
      sent.push(args);
      records[args.day] = { archive_sha256: args.archive_sha256, readings: args.readings };
    },
  };
}

const deps = (c, extra = {}) => ({
  hashOf: async () => HASH,
  readingsOf: async () => '',
  view: c.view,
  send: c.send,
  log: () => {},
  ...extra,
});

test('a day counts as finished only after it ended and settled', () => {
  const files = ['2026-11-02.jsonl', '2026-11-01.jsonl', 'notes.txt', '2026-11-03.jsonl'];
  assert.deepEqual(finishedDays(files, new Date('2026-11-03T01:59:59Z')), ['2026-11-01']);
  assert.deepEqual(finishedDays(files, new Date('2026-11-03T02:00:00Z')), ['2026-11-01', '2026-11-02']);
});

test('days recorded late carry the hash only', () => {
  assert.equal(readingsFor('2026-11-01'), '');
  assert.equal(readingsFor('2026-11-02'), ''); // the backfill reached it on 5 Nov
});

test('later days carry the readings and when they were computed', () => {
  assert.equal(
    readingsFor(FIRST_DAY_WITH_READINGS, THESIS),
    'Q1=Neutral;Q3=Not Measured;verdict=Bullish;score=3;asOf=2026-11-01',
  );
});

test('readings over the contract limit stop the send, not get cut', () => {
  const long = { ...THESIS, readings: [{ id: 'Q1', side: 'x'.repeat(300) }] };
  assert.throws(() => readingsFor(FIRST_DAY_WITH_READINGS, long), /too long/);
});

test('missing readings stop the send instead of writing an empty record', () => {
  assert.throws(() => readingsFor(FIRST_DAY_WITH_READINGS, undefined));
});

test('sends a missing day and confirms it', async () => {
  const c = chain();
  const out = await sendPending(['2026-11-01'], deps(c));
  assert.deepEqual(out, [{ day: '2026-11-01', status: 'sent' }]);
  assert.deepEqual(c.sent, [{ day: '2026-11-01', archive_sha256: HASH, readings: '' }]);
});

test('a re-run sends nothing', async () => {
  const c = chain({ '2026-11-01': { archive_sha256: HASH } });
  const out = await sendPending(['2026-11-01'], deps(c));
  assert.deepEqual(out, [{ day: '2026-11-01', status: 'already' }]);
  assert.equal(c.sent.length, 0);
});

test('a file that differs from its record stops the run before later days', async () => {
  const c = chain({ '2026-11-01': { archive_sha256: 'b'.repeat(64) } });
  await assert.rejects(sendPending(['2026-11-01', '2026-11-02'], deps(c)), /differs/);
  assert.equal(c.sent.length, 0);
});

test('a send the contract does not show fails loudly', async () => {
  const c = chain();
  await assert.rejects(sendPending(['2026-11-01'], deps(c, { send: () => {} })), /sent, but/);
});

test('dry run sends nothing', async () => {
  const c = chain();
  const out = await sendPending(['2026-11-01'], deps(c, { dryRun: true }));
  assert.deepEqual(out, [{ day: '2026-11-01', status: 'dry-run' }]);
  assert.equal(c.sent.length, 0);
});
