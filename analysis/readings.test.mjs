import { test } from 'node:test';
import assert from 'node:assert/strict';
import { q1, q2, q3, q4, q5, verdict, concentration, runRates } from './readings.mjs';

const B = 'Bullish', N = 'Neutral', R = 'Bearish', M = 'Not Measured';

test('T-6.1 Q1 sides on the -1 line: exactly on it is Neutral', () => {
  assert.equal(q1({ lo: -0.99, hi: 0.4 }).side, B);
  assert.equal(q1({ lo: -1, hi: 0.4 }).side, N);
  assert.equal(q1({ lo: -1.4, hi: 0.4 }).side, N);
  assert.equal(q1({ lo: -3, hi: -1 }).side, N);
  assert.equal(q1({ lo: -3, hi: -1.01 }).side, R);
  assert.equal(q1(null).side, M);
  assert.equal(q1(null).detail, 'Still to estimate');
  assert.equal(q1(null, 0).detail, '0 usable fee changes, 3 needed');
  assert.equal(q1(null, 1).detail, '1 usable fee change, 3 needed');
});

const days = (n, fees, rev) => Array.from({ length: n }, () => ({ fees, revenue: rev }));

test('T-6.1 Q2 sides: above 30% Bullish, below 20% on each of 14 days Bearish', () => {
  assert.equal(q2(days(30, 100, 30.01)).side, B);
  assert.equal(q2(days(30, 100, 30)).side, N);
  assert.equal(q2(days(30, 100, 19.99)).side, R);
  assert.equal(q2(days(30, 100, 20)).side, N);
  // 14 low days at the end are not enough on their own if one of them is at 20%
  const mixed = [...days(16, 100, 30), ...days(13, 100, 10), { fees: 100, revenue: 20 }];
  assert.equal(q2(mixed).side, N);
  assert.equal(q2(days(29, 100, 50)).side, M);
  assert.equal(q2(days(30, 0, 0)).side, M);
});

test('T-6.1 Q3 sides: spread and top-3 together; Bearish if either passes its line; missing is Not Measured', () => {
  assert.equal(q3({ spreadBps: 4.99, top3: 0.59 }).side, B);
  assert.equal(q3({ spreadBps: 5, top3: 0.59 }).side, N);
  assert.equal(q3({ spreadBps: 4, top3: 0.6 }).side, N);
  assert.equal(q3({ spreadBps: 10, top3: 0.8 }).side, N);
  assert.equal(q3({ spreadBps: 10.01, top3: 0.3 }).side, R);
  assert.equal(q3({ spreadBps: 2, top3: 0.81 }).side, R);
  assert.equal(q3({ spreadBps: 2, top3: null }).side, M);
  assert.equal(q3({ spreadBps: null, top3: 0.3 }).side, M);
});

test('T-6.1 Q4 sides: under 50% Bullish, over 80% Bearish', () => {
  assert.equal(q4(0.499).side, B);
  assert.equal(q4(0.5).side, N);
  assert.equal(q4(0.8).side, N);
  assert.equal(q4(0.801).side, R);
  assert.equal(q4(null).side, M);
});

test('T-6.1 Q5 sides: rose or fell over each of the last 3 months', () => {
  assert.equal(q5([1, 2, 3, 4]).side, B);
  assert.equal(q5([4, 3, 2, 1]).side, R);
  assert.equal(q5([1, 2, 2, 4]).side, N);
  assert.equal(q5([1, 3, 2, 4]).side, N);
  assert.equal(q5([1, 2, 3]).side, M);
  assert.equal(q5(null).side, M);
});

test('T-6.1 verdict: Q1 and Q5 count double, 3 or more Not Measured is Undecided', () => {
  assert.equal(verdict([B, B, B, B, B]).score, 7);
  assert.equal(verdict([B, B, B, B, B]).verdict, B);
  assert.equal(verdict([R, R, R, R, R]).verdict, R);
  assert.equal(verdict([R, R, R, R, R]).score, -7);
  assert.equal(verdict([B, N, N, N, N]).score, 2);
  assert.equal(verdict([B, N, N, N, N]).verdict, 'Undecided');
  assert.equal(verdict([B, N, N, N, B]).score, 4);
  assert.equal(verdict([B, N, N, N, B]).verdict, B);
  assert.equal(verdict([N, B, N, N, B]).score, 3);
  assert.equal(verdict([N, B, N, N, B]).verdict, B);
  assert.equal(verdict([N, B, N, N, N]).score, 1);
  assert.equal(verdict([R, N, N, N, R]).verdict, R);
  // three Not Measured wins over the score
  assert.equal(verdict([B, M, M, M, B]).verdict, 'Undecided');
  assert.equal(verdict([B, M, M, N, B]).verdict, B);
});

// Hand-worked: volumes 50, 30, 20 -> shares 0.5, 0.3, 0.2 -> HHI = 2500 + 900 + 400 = 3800; top-3 = 1.0.
// With a fourth of 100 added (total 200): shares 0.25, 0.15, 0.1, 0.5 -> HHI = 625 + 225 + 100 + 2500 = 3450; top-3 = 0.5 + 0.25 + 0.15 = 0.9.
test('T-6.2 HHI and top-3 match the hand-worked fixture', () => {
  const a = concentration([50, 30, 20]);
  assert.equal(a.hhi, 3800);
  assert.equal(a.top3, 1);
  const b = concentration([50, 30, 20, 100]);
  assert.ok(Math.abs(b.hhi - 3450) < 1e-9);
  assert.ok(Math.abs(b.top3 - 0.9) < 1e-9);
  assert.deepEqual(concentration([]), { hhi: null, top3: null });
  assert.deepEqual(concentration([0, 0]), { hhi: null, top3: null });
});

test('T-6.2 run rates: trailing 90-day revenue at the last day and 30, 60, 90 days earlier', () => {
  const series = Array.from({ length: 180 }, (_, i) => ({ day: i, revenue: i < 90 ? 1 : i < 120 ? 2 : 3 }));
  const r = runRates(series);
  assert.equal(r.length, 4);
  // oldest first: days 0-89 -> 90; days 30-119 -> 60*1 + 30*2 = 150; days 60-149 -> 30*1... check by sum
  const sum = (a, b) => series.slice(a, b + 1).reduce((s, x) => s + x.revenue, 0);
  assert.deepEqual(r, [sum(0, 89), sum(30, 119), sum(60, 149), sum(90, 179)]);
  assert.equal(runRates(series.slice(0, 100)), null);
});

test('A2 rule 3: Q3 and Q4 read Not Measured over the 50% line; exactly 50% is not over', () => {
  assert.equal(q3({ spreadBps: 4, top3: 0.5, treasuryShare: 0.5 }).side, B);
  assert.equal(q4(0.4, 'X', 0.5).side, B);
  const a = q3({ spreadBps: 4, top3: 0.5, treasuryShare: 0.94 });
  assert.equal(a.side, M);
  assert.equal(a.detail, 'Flow went private: treasury 94% of USD');
  assert.equal(a.privateFlow, true);
  const b = q4(0.7, 'SwapKit', 0.5001);
  assert.equal(b.side, M);
  assert.equal(b.detail, 'Flow went private: treasury 50.0% of USD');
  assert.equal(q3({ spreadBps: 4, top3: 0.5, treasuryShare: 0.504 }).detail, 'Flow went private: treasury 50.4% of USD');
  // No treasury share known: the reading stands as section 6 has it.
  assert.equal(q3({ spreadBps: 4, top3: 0.5 }).side, B);
  assert.equal(q4(0.4).side, B);
});

test('A2 rule 4: over the line the public figures stay as side figures, and a missing one stays missing', () => {
  assert.deepEqual(q3({ spreadBps: 10.4, top3: 0.65, treasuryShare: 0.64 }).sideFigures, { spreadBps: 10.4, top3: 0.65 });
  assert.deepEqual(q3({ spreadBps: null, top3: 0.65, treasuryShare: 0.64 }).sideFigures, { spreadBps: null, top3: 0.65 });
  assert.deepEqual(q4(0.75, 'SwapKit', 0.6).sideFigures, { share: 0.75, name: 'SwapKit' });
});

test('A2 rule 5: a held verdict is Undecided whatever the score, and the score is still published', () => {
  const v = verdict([N, B, M, N, B], ['Q3']);
  assert.deepEqual(v, { verdict: 'Undecided', score: 3, missing: 1, held: ['Q3'] });
  assert.equal(verdict([R, R, M, N, R], ['Q3']).verdict, 'Undecided', 'a hold stops Bearish too');
  assert.equal(verdict([R, R, M, N, R], ['Q3']).score, -5);
  assert.equal(verdict([N, B, M, M, B], ['Q3', 'Q4']).held.length, 2);
});

test('A2 rule 5: a Not Measured for any other reason does not hold, and the verdict returns by itself', () => {
  assert.equal(verdict([N, B, M, N, B]).verdict, B, 'section 6 stands when no reading is held');
  const read = (treasuryShare) => { const r = q3({ spreadBps: 3, top3: 0.5, treasuryShare }); return verdict([N, B, r.side, N, B], r.privateFlow ? ['Q3'] : []); };
  assert.equal(read(0.51).verdict, 'Undecided');
  assert.equal(read(0.5).verdict, B);
});
