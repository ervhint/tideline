import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideChanges, alarmMessage } from './alarm.mjs';

const thesis = (sides, verdict = 'Neutral') => ({
  readings: sides.map((side, i) => ({ id: `Q${i + 1}`, name: `Reading ${i + 1}`, side, detail: `d${i + 1}` })),
  verdict: { verdict, score: 0, missing: 0 },
});
const AT = '2026-11-03T03:00:00Z';

test('T-8.1 a reading that changes side gives one entry', () => {
  const c = sideChanges(thesis(['Neutral', 'Bullish']), thesis(['Bullish', 'Bullish']), AT);
  assert.deepEqual(c, [{ at: AT, id: 'Q1', name: 'Reading 1', from: 'Neutral', to: 'Bullish', detail: 'd1' }]);
});

test('T-8.1 a changed verdict is listed as its own entry', () => {
  const c = sideChanges(thesis(['Neutral'], 'Neutral'), thesis(['Bullish'], 'Bullish'), AT);
  assert.deepEqual(c.map((x) => x.id), ['Q1', 'Verdict']);
});

test('T-8.2 no change gives nothing', () => {
  assert.deepEqual(sideChanges(thesis(['Neutral', 'Bearish']), thesis(['Neutral', 'Bearish']), AT), []);
});

test('T-8.2 numbers moving without a side change gives nothing', () => {
  const a = thesis(['Neutral']), b = thesis(['Neutral']);
  b.readings[0].detail = 'different words';
  assert.deepEqual(sideChanges(a, b, AT), []);
});

test('T-8.2 no earlier file means no alarm', () => {
  assert.deepEqual(sideChanges(null, thesis(['Bullish']), AT), []);
});

test('T-8.1 message is one text and says when it is only a measurement change', () => {
  const m = alarmMessage(sideChanges(thesis(['Not Measured', 'Neutral']), thesis(['Bullish', 'Bearish']), AT));
  assert.match(m, /2 readings changed side/);
  assert.match(m, /measurement started or stopped/);
  assert.match(m, /Neutral -> Bearish/);
});
