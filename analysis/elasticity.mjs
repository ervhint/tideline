// E1 (does volume leave when a frontend's fee rises?) and E2 (how much of a fee change reaches the user?) on frozen chain days (T5).
// Follows PREREG.md sections 3 and 4; where this code and that file differ, the file is the definition.
// Pure: parsed day files in ({ head, swaps } from parseDayFile), numbers out. No network, no clock. Placebo draws use fixed seeds.
import { costParts } from './realised_cost.mjs';

export const SEED = 20261101; // PREREG 3
export const SEED_E2 = 20261102; // PREREG 4
export const SEED_E2_BUCKET = 20261103;
export const REPS = 10000;
export const SHIFT_BPS = 5;
export const MIN_DAY_SWAPS = 10;
export const MIN_SHARE = 0.7;
export const MIN_RUN_DAYS = 7;
export const MIN_CHANGE_BPS = 5;
export const MAX_GAP_DAYS = 7;
export const WINDOW_DAYS = 7;
export const MIN_WINDOW_DAYS = 4;
export const MIN_BEFORE_USD = 50000;
export const MIN_EVENTS = 3;
export const LEFT_OUT_DAYS = ['2026-10-04']; // the last day of the 1 to 4 Oct exploit pause
export const HUB_SHIFT_DAYS = ['2026-10-28', '2026-10-29', '2026-10-30']; // flow moved from token_diff swaps to the Confidential Intents treasury
export const NOT_FRONTENDS = new Set(['', '1click-unknown']);
const E2_BUCKET = '1k-10k';

const DAY_MS = 86_400_000;
const dayAdd = (d, k) => new Date(Date.parse(`${d}T00:00:00Z`) + k * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;
const isFrontend = (ref) => !NOT_FRONTENDS.has(ref ?? '');

// ---- Census: fee rates and swap counts only, no USD (PREREG 3, "Events") ----

// Per frontend: each day's swap count and rounded fee-rate counts, its daily fee, stable runs, every change, and the events.
export function census(days) {
  const per = new Map(); // ref -> day -> { n, fees: Map<bps, count> }
  for (const d of days) {
    for (const r of d.swaps) {
      if (r.k !== 'd' || !isFrontend(r.ref)) continue;
      const byDay = per.get(r.ref) ?? per.set(r.ref, new Map()).get(r.ref);
      const c = byDay.get(d.head.day) ?? byDay.set(d.head.day, { n: 0, fees: new Map() }).get(d.head.day);
      c.n += r.n;
      if (r.fee == null) continue;
      const bps = Math.round(r.fee);
      c.fees.set(bps, (c.fees.get(bps) ?? 0) + r.n);
    }
  }
  const frontends = [];
  for (const [ref, byDay] of [...per].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const daily = [];
    for (const [day, c] of [...byDay].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const withFee = [...c.fees.values()].reduce((t, v) => t + v, 0);
      // Most swaps wins; a tie goes to the lower rate, so the result does not depend on reading order.
      const top = [...c.fees].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      const fee = c.n >= MIN_DAY_SWAPS && top && top[1] / withFee >= MIN_SHARE ? top[0] : null;
      daily.push({ day, swaps: c.n, fee });
    }
    const runs = [];
    for (const d of daily) {
      if (d.fee == null) continue;
      const r = runs.at(-1);
      if (r && r.fee === d.fee) { r.end = d.day; r.days++; } else runs.push({ fee: d.fee, start: d.day, end: d.day, days: 1 });
    }
    const changes = [], events = [];
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1], b = runs[i];
      changes.push({ lastDayBefore: a.end, firstDayAfter: b.start, from: a.fee, to: b.fee });
      if (a.days >= MIN_RUN_DAYS && b.days >= MIN_RUN_DAYS && Math.abs(b.fee - a.fee) >= MIN_CHANGE_BPS && daysBetween(a.end, b.start) <= MAX_GAP_DAYS) {
        events.push({ frontend: ref, lastDayBefore: a.end, firstDayAfter: b.start, from: a.fee, to: b.fee, daysBefore: a.days, daysAfter: b.days });
      }
    }
    frontends.push({ frontend: ref, activeDays: daily.length, feeDays: daily.filter((d) => d.fee != null).length, runs, changes, events });
  }
  const events = frontends.flatMap((f) => f.events).sort((a, b) => (a.firstDayAfter < b.firstDayAfter ? -1 : a.firstDayAfter > b.firstDayAfter ? 1 : a.frontend < b.frontend ? -1 : 1));
  return { frontends, events };
}

// ---- Panel: USD and cost rows per frontend per calendar day ----

// Every calendar day from the first to the last frozen day. A missing day (a gap) and LEFT_OUT_DAYS are marked left out.
export function panelOf(days) {
  const have = new Map(days.map((d) => [d.head.day, d]));
  const first = days[0].head.day, n = daysBetween(first, days.at(-1).head.day) + 1;
  const cal = Array.from({ length: n }, (_, i) => dayAdd(first, i));
  const at = new Map(cal.map((d, i) => [d, i]));
  const out = new Set(cal.filter((d) => !have.has(d) || LEFT_OUT_DAYS.includes(d)).map((d) => at.get(d)));
  const f = new Map(); // ref -> { vol: Float64Array, rows: Array<rows[]> }
  const total = new Float64Array(n);
  for (const [day, d] of have) {
    const i = at.get(day);
    for (const r of d.swaps) {
      if (r.k !== 'd') continue;
      const ref = r.ref ?? '';
      const s = f.get(ref) ?? f.set(ref, { vol: new Float64Array(n), rows: Array.from({ length: n }, () => []) }).get(ref);
      s.rows[i].push(r);
      if (r.b === 'unpriced' || !(r.vol > 0)) continue;
      s.vol[i] += r.vol; total[i] += r.vol;
    }
  }
  return { days: cal, at, out, f, total };
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slope = (x, y) => { let a = 0, b = 0; for (let i = 0; i < x.length; i++) { a += x[i] * y[i]; b += x[i] * x[i]; } return a / b; };
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const overlaps = ([l, r], lo, hi) => l <= hi && r >= lo;

// changes: Map ref -> [[l, r]] day-index ranges of every change in the census (PREREG 3: any size or length).
export function changeRanges(panel, cen) {
  const m = new Map();
  for (const fr of cen.frontends) {
    const rs = fr.changes.map((c) => [panel.at.get(c.lastDayBefore), panel.at.get(c.firstDayAfter)]).filter(([l, r]) => l !== undefined && r !== undefined);
    if (rs.length) m.set(fr.frontend, rs);
  }
  return m;
}

const allInBps = (rows) => costParts(rows, 0).allInBps;

// One comparison for frontend f with the before window ending at li and the after window starting at fi. null when unusable.
function compare(panel, ranges, f, li, fi, ownEvent, control) {
  const before = [], after = [];
  for (let i = li - WINDOW_DAYS + 1; i <= li; i++) before.push(i);
  for (let i = fi; i < fi + WINDOW_DAYS; i++) after.push(i);
  if (before[0] < 0 || after.at(-1) >= panel.days.length) return null;
  const b = before.filter((i) => !panel.out.has(i)), a = after.filter((i) => !panel.out.has(i));
  if (b.length < MIN_WINDOW_DAYS || a.length < MIN_WINDOW_DAYS) return null;
  const lo = before[0], hi = after.at(-1);
  for (const rg of ranges.get(f) ?? []) if (!(ownEvent && rg[0] === li && rg[1] === fi) && overlaps(rg, lo, hi)) return null;
  const s = panel.f.get(f);
  if (!s) return null;
  const sum = (arr, idx) => idx.reduce((t, i) => t + arr[i], 0);
  const sB = sum(s.vol, b), sA = sum(s.vol, a);
  let cB, cA;
  if (control) {
    if ([...b, ...a].some((i) => !(control[i] > 0))) return null;
    cB = sum(control, b); cA = sum(control, a);
  } else {
    const drop = [s];
    for (const [g, rs] of ranges) if (g !== f && panel.f.has(g) && rs.some((rg) => overlaps(rg, lo, hi))) drop.push(panel.f.get(g));
    const ctl = (idx) => idx.reduce((t, i) => t + panel.total[i] - drop.reduce((u, d) => u + d.vol[i], 0), 0);
    cB = ctl(b); cA = ctl(a);
  }
  if (!(cB > 0) || !(cA > 0)) return null;
  const rowsIn = (idx, pick = () => true) => idx.flatMap((i) => s.rows[i].filter(pick));
  const dc = (pick) => { const x = allInBps(rowsIn(b, pick)), y = allInBps(rowsIn(a, pick)); return x == null || y == null ? null : y - x; };
  return {
    lo, hi, beforeDays: b.length, afterDays: a.length, beforeUsd: sB, afterUsd: sA,
    dv: sB > 0 && sA > 0 ? Math.log(sA / a.length / (sB / b.length)) - Math.log(cA / a.length / (cB / b.length)) : null,
    dcost: dc(() => true), dcostBucket: dc((r) => r.b === E2_BUCKET),
  };
}

function summarize(est, placebo) {
  const n = placebo.length;
  const abs = Float64Array.from(placebo, Math.abs).sort();
  const q95 = abs[Math.ceil(0.95 * n) - 1];
  let ge = 0;
  for (const v of placebo) if (Math.abs(v) >= Math.abs(est)) ge++;
  const sorted = Float64Array.from(placebo).sort();
  const pct = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const s = sd(Array.from(placebo));
  const mde = 2.8 * s;
  const bins = 41, span = Math.max(abs[n - 1], Math.abs(est)) || 1;
  const hist = new Array(bins).fill(0);
  for (const v of placebo) hist[Math.min(bins - 1, Math.floor(((v + span) / (2 * span)) * bins))]++;
  return {
    estimate: est, lo: est - q95, hi: est + q95, p: (ge + 1) / (n + 1), pMin: 1 / (n + 1), mde, placeboSd: s,
    underpowered: !(est - q95 > 0 || est + q95 < 0) || Math.abs(est) < mde,
    percentiles: { p01: pct(0.01), p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95), p99: pct(0.99) },
    histogram: { min: -span, max: span, counts: hist },
  };
}

// Slope through zero across events; each placebo draw swaps every event's y for one of its placebo dates' y.
function slopeRun(x, realY, candY, reps, seed) {
  const rng = mulberry32(seed);
  const placebo = new Float64Array(reps), y = new Array(x.length);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < x.length; i++) y[i] = candY[i][Math.floor(rng() * candY[i].length)];
    placebo[r] = slope(x, y);
  }
  return summarize(slope(x, realY), placebo);
}

// events from census(). One full run under one setting (PREREG 3 "Estimate", PREREG 4).
export function estimate(panel, ranges, events, { shift = SHIFT_BPS, reps = REPS, skip = () => false, control = null } = {}) {
  const used = [], dropped = [];
  for (const e of events) {
    const base = { frontend: e.frontend, lastDayBefore: e.lastDayBefore, firstDayAfter: e.firstDayAfter, from: e.from, to: e.to };
    if (skip(e)) { dropped.push({ ...base, reason: 'left out by this check' }); continue; }
    const li = panel.at.get(e.lastDayBefore), fi = panel.at.get(e.firstDayAfter);
    const c = li === undefined || fi === undefined ? null : compare(panel, ranges, e.frontend, li, fi, true, control);
    if (!c) { dropped.push({ ...base, reason: `a window has under ${MIN_WINDOW_DAYS} days, runs past the data, lacks a control day, or another change of its own touches it` }); continue; }
    if (c.beforeUsd < MIN_BEFORE_USD) { dropped.push({ ...base, reason: `under $50,000 in the 7 days before ($${Math.round(c.beforeUsd).toLocaleString('en-US')})` }); continue; }
    if (c.dv == null) { dropped.push({ ...base, reason: 'no volume after the change' }); continue; }
    const cands = [];
    for (let pl = WINDOW_DAYS - 1; pl + (fi - li) + WINDOW_DAYS - 1 < panel.days.length; pl++) {
      if (pl === li) continue;
      const r = compare(panel, ranges, e.frontend, pl, pl + (fi - li), false, control);
      if (r && r.dv != null) cands.push(r);
    }
    if (!cands.length) { dropped.push({ ...base, reason: 'no placebo date with volume in both windows' }); continue; }
    const { lo, hi, ...rest } = c;
    used.push({ ...base, ...rest, windowFrom: panel.days[lo], windowTo: panel.days[hi], df: Math.log((e.to + shift) / (e.from + shift)), dfee: e.to - e.from, cands });
  }
  const out = { shift, usable: used.length, events: used.map(({ cands, ...u }) => ({ ...u, placeboDates: cands.length })), dropped, e1: null, e2: null, e2Bucket: null, e2Events: 0, e2BucketEvents: 0 };
  if (used.length < MIN_EVENTS) return out;
  out.e1 = slopeRun(used.map((u) => u.df), used.map((u) => u.dv), used.map((u) => u.cands.map((c) => c.dv)), reps, SEED);
  const e2 = (key, seed) => {
    const ok = used.map((u) => ({ u, c: u.cands.filter((c) => c[key] != null) })).filter(({ u, c }) => u[key] != null && c.length);
    return { n: ok.length, r: ok.length < MIN_EVENTS ? null : slopeRun(ok.map(({ u }) => u.dfee), ok.map(({ u }) => u[key]), ok.map(({ c }) => c.map((x) => x[key])), reps, seed) };
  };
  const a = e2('dcost', SEED_E2), b = e2('dcostBucket', SEED_E2_BUCKET);
  Object.assign(out, { e2: a.r, e2Events: a.n, e2Bucket: b.r, e2BucketEvents: b.n });
  return out;
}

// The main result and the checks of PREREG 3. venues: [{ key, name, series }] on the panel's calendar days (CoW Swap first).
export function estimateAll(panel, ranges, events, { venues = [], reps = REPS } = {}) {
  const main = estimate(panel, ranges, events, { reps });
  const byFrontend = new Map();
  for (const e of main.events) byFrontend.set(e.frontend, Math.max(byFrontend.get(e.frontend) ?? 0, e.beforeUsd));
  const largest = [...byFrontend].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const shiftIdx = HUB_SHIFT_DAYS.map((d) => panel.at.get(d)).filter((i) => i !== undefined);
  const touchesShift = (e) => {
    const lo = panel.at.get(e.lastDayBefore) - WINDOW_DAYS + 1, hi = panel.at.get(e.firstDayAfter) + WINDOW_DAYS - 1;
    return shiftIdx.some((i) => i >= lo && i <= hi);
  };
  const checks = {
    dropLargest: { label: `Drop the largest frontend (${largest ?? 'none'})`, skipped: largest, ...estimate(panel, ranges, events, { reps, skip: (e) => e.frontend === largest }) },
    shift2: { label: 'Fee shift 2 bps instead of 5', ...estimate(panel, ranges, events, { reps, shift: 2 }) },
    shift10: { label: 'Fee shift 10 bps instead of 5', ...estimate(panel, ranges, events, { reps, shift: 10 }) },
    noHubShift: { label: 'Leave out events whose windows touch 28 to 30 Oct (the move to the treasury)', skipped: events.filter(touchesShift).map((e) => e.frontend), ...estimate(panel, ranges, events, { reps, skip: touchesShift }) },
  };
  for (const v of venues) checks[`control_${v.key}`] = { label: `${v.name} on DefiLlama as the control`, ...estimate(panel, ranges, events, { reps, control: v.series }) };
  return { main, checks };
}
