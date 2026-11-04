import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectEvents } from './prereg_events.mjs';

const good = { key: 'referral:app', lastDayBefore: '2026-03-01', firstDayAfter: '2026-03-03', from: 20, to: 30, daysBefore: 14, daysAfter: 14 };
const kept = (change) => selectEvents([{ ...good, ...change }]).length === 1;

test('keeps a clean step and names its frontend', () => {
  assert.deepEqual(selectEvents([good]), [{ frontend: 'app', lastDayBefore: '2026-03-01', firstDayAfter: '2026-03-03', from: 20, to: 30 }]);
});

test('keeps only frontends, because a recipient can change without the user paying more', () => {
  assert.equal(kept({ key: 'recipient:app.near' }), false);
  assert.equal(kept({ key: 'referral:(none)' }), false);
  assert.equal(kept({ key: 'referral:' }), false);
});

test('needs a change of at least 5 bps, in either direction', () => {
  assert.equal(kept({ to: 25 }), true);
  assert.equal(kept({ to: 15 }), true);
  assert.equal(kept({ to: 24 }), false);
});

test('needs 14 stable days on each side', () => {
  assert.equal(kept({ daysBefore: 13 }), false);
  assert.equal(kept({ daysAfter: 13 }), false);
});

test('needs a change that took at most 7 days', () => {
  assert.equal(kept({ firstDayAfter: '2026-03-08' }), true);
  assert.equal(kept({ firstDayAfter: '2026-03-09' }), false);
});
