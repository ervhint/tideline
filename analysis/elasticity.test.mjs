import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRanges, estimate, estimateAll, feeSwitch, panelFromRows } from './elasticity.mjs';

// A made-up market: 200 days, 30 frontends, a shared daily mood, and 8 fee changes with a known response.
const N = 200, DAYS = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
function lcg(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function market({ elasticity, passThrough, seed = 7 }) {
  const rnd = lcg(seed), mood = DAYS.map(() => Math.exp((rnd() - 0.5) * 0.3));
  const rows = [], census = [], events = [];
  for (let k = 0; k < 30; k++) {
    const name = `app${k}`, base = 50000 + k * 3000;
    const hit = k < 8, at = 90 + k * 4, from = 10, to = 30;
    if (hit) {
      census.push({ key: `referral:${name}`, lastDayBefore: DAYS[at], firstDayAfter: DAYS[at + 1], from, to });
      events.push({ frontend: name, lastDayBefore: DAYS[at], firstDayAfter: DAYS[at + 1], from, to });
    }
    for (let d = 0; d < N; d++) {
      const after = hit && d > at;
      let v = base * mood[d] * Math.exp((rnd() - 0.5) * 0.3);
      if (after) v *= Math.exp(elasticity * Math.log((to + 5) / (from + 5)));
      const cost = (hit ? (after ? 20 + passThrough * (to - from) : 20) : 20) / 1e4;
      rows.push({ day: DAYS[d], referral: name, bucket: '1k-10k', usd_in: v, usd_out: v * (1 - cost) });
    }
  }
  const panel = panelFromRows(DAYS, rows);
  // An outside venue that only follows the shared mood, like CoW Swap does for the market.
  const cow = Float64Array.from(mood, (m) => 9e6 * m);
  return { panel, ranges: changeRanges(panel, census), events, cow, mood };
}

test('T-5.2 finds a known elasticity and covers it with the interval', () => {
  const { panel, ranges, events } = market({ elasticity: -1.5, passThrough: 0.7 });
  const r = estimate(panel, ranges, events, { reps: 1000 });
  assert.equal(r.usable, 8);
  assert.ok(Math.abs(r.e1.estimate + 1.5) < 0.3, `estimate ${r.e1.estimate}`);
  assert.ok(r.e1.lo < -1.5 && r.e1.hi > -1.5, 'interval covers the true value');
  assert.ok(r.e1.hi < 0 && !r.e1.underpowered, 'a strong effect is not underpowered');
  assert.ok(Math.abs(r.e2.estimate - 0.7) < 0.05, `pass-through ${r.e2.estimate}`);
  assert.ok(r.e1.mde > 0 && r.e1.pMin === 1 / 1001 && r.e1.histogram.counts.length === 41);
});

test('T-5.2 no effect reads as underpowered, and the result repeats exactly', () => {
  const { panel, ranges, events } = market({ elasticity: 0, passThrough: 0, seed: 11 });
  const a = estimate(panel, ranges, events, { reps: 1000 }), b = estimate(panel, ranges, events, { reps: 1000 });
  assert.ok(a.e1.lo < 0 && a.e1.hi > 0 && a.e1.underpowered);
  assert.deepEqual(a.e1, b.e1);
});

test('AC-5.2 publishes the drop-the-largest check and the fee-shift checks; windows touching holes are left out', () => {
  const { panel, ranges, events } = market({ elasticity: -1.5, passThrough: 0.7 });
  const { main, checks } = estimateAll(panel, ranges, events, { reps: 500 });
  assert.equal(checks.dropLargest.usable, main.usable - 1);
  assert.ok(checks.shift2.e1 && checks.shift10.e1 && checks.noExploit.e1);
  const thin = estimate(panel, ranges, [{ frontend: 'app0', lastDayBefore: DAYS[5], firstDayAfter: DAYS[6], from: 10, to: 30 }], { reps: 100 });
  assert.equal(thin.usable, 0);
  assert.equal(thin.e1, null);
  assert.match(thin.dropped[0].reason, /window too short/);
});

test('an event with under $100,000 before it is dropped and listed', () => {
  const { panel, ranges, events } = market({ elasticity: -1, passThrough: 0 });
  panel.f.get('app0').inn.fill(1);
  const r = estimate(panel, ranges, events, { reps: 100 });
  assert.equal(r.usable, 7);
  assert.match(r.dropped[0].reason, /under \$100,000/);
});

test('U5 CoW control: an outside venue that follows the market recovers the same elasticity', () => {
  const { panel, ranges, events, cow } = market({ elasticity: -1.5, passThrough: 0.7 });
  const r = estimate(panel, ranges, events, { reps: 1000, control: cow });
  assert.equal(r.usable, 8);
  assert.ok(Math.abs(r.e1.estimate + 1.5) < 0.3, `estimate ${r.e1.estimate}`);
  const all = estimateAll(panel, ranges, events, { reps: 200, cow });
  assert.equal(all.checks.cowControl.label, 'CoW Swap on DefiLlama as the control (D14)');
  assert.equal(all.checks.cowControl.usable, 8);
});

test('FR-21 more control venues: each is its own check, and a venue with no history before the events gives no estimate', () => {
  const { panel, ranges, events, cow } = market({ elasticity: -1.5, passThrough: 0.7 });
  const late = Float64Array.from(cow, (v, i) => (i < N - 20 ? 0 : v)); // starts too late, like the Uniswap aggregator
  const all = estimateAll(panel, ranges, events, { reps: 200, venues: [{ key: 'a', name: 'Venue A', series: cow }, { key: 'b', name: 'Venue B', series: late }] });
  assert.equal(all.checks.control_a.label, 'Venue A on DefiLlama as the control');
  assert.ok(Math.abs(all.checks.control_a.e1.estimate + 1.5) < 0.3);
  assert.equal(all.checks.control_b.usable, 0);
  assert.equal(all.checks.control_b.e1, null);
});

test('U5 CoW control: a day missing from the control makes the windows around it unusable', () => {
  const { panel, ranges, events, cow } = market({ elasticity: -1.5, passThrough: 0.7 });
  const gap = Float64Array.from(cow);
  gap[panel.at.get(events[0].firstDayAfter)] = 0;
  const r = estimate(panel, ranges, events, { reps: 200, control: gap });
  // Events are 4 days apart, so the missing day sits inside the 14-day windows of the first 4.
  assert.equal(r.usable, 4);
  assert.deepEqual(r.dropped.map((d) => d.frontend), ['app0', 'app1', 'app2', 'app3']);
  for (const d of r.dropped) assert.match(d.reason, /window/);
});

test('U5 fee switch: descriptive change is all volume minus the control, over 14 days each side', () => {
  const { panel, cow } = market({ elasticity: 0, passThrough: 0 });
  const f = feeSwitch(panel, cow, '2026-03-01');
  assert.equal(f.lastDayBefore, '2026-02-28');
  assert.equal(f.descriptive, true);
  assert.ok(Math.abs(f.change - (f.intentsLogChange - f.cowLogChange)) < 1e-12);
  assert.ok(Math.abs(f.change) < 0.1, `no event, so close to zero: ${f.change}`);
  assert.equal(feeSwitch(panel, cow, '2026-01-05'), null, 'too close to the start for a 14-day window');
});
