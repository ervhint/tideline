// E1 (does volume leave when fees rise?) and E2 (how much of a fee change reaches the user?), as written in PREREG.md sections 3 and 4.
// Pure: a panel and an event list in, numbers out. No network, no clock. The placebo draws use a fixed seed so anyone gets the same result.

export const SEED = 20261101;
export const REPS = 10000;
export const SHIFT_BPS = 5;
export const MIN_BEFORE_USD = 100000;
export const WINDOW_DAYS = 14;
const HOLES = ['2025-10-06', '2026-04-16', '2026-04-17'];
export const EXPLOIT_DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
export const LEFT_OUT = new Set([...HOLES, ...EXPLOIT_DAYS]);

// rows: snapshot rows { day, referral, bucket, usd_in, usd_out }. days: every UTC day in order, no gaps.
export function panelFromRows(days, rows) {
  const at = new Map(days.map((d, i) => [d, i]));
  const f = new Map();
  for (const r of rows) {
    const i = at.get(r.day);
    if (i === undefined) continue;
    const s = f.get(r.referral) ?? f.set(r.referral, { inn: new Float64Array(days.length), out: new Float64Array(days.length), in2: new Float64Array(days.length), out2: new Float64Array(days.length) }).get(r.referral);
    s.inn[i] += r.usd_in; s.out[i] += r.usd_out;
    if (r.bucket === '1k-10k') { s.in2[i] += r.usd_in; s.out2[i] += r.usd_out; }
  }
  const total = new Float64Array(days.length);
  for (const s of f.values()) for (let i = 0; i < days.length; i++) total[i] += s.inn[i];
  return { days, at, f, total };
}

// Every fee change of any size, from the raw census, as day-index ranges per frontend ('(none)' is the blank referral).
export function changeRanges(panel, censusEvents) {
  const m = new Map();
  for (const e of censusEvents) {
    if (!e.key.startsWith('referral:')) continue;
    const name = e.key.slice(9) === '(none)' ? '' : e.key.slice(9);
    const l = panel.at.get(e.lastDayBefore), r = panel.at.get(e.firstDayAfter);
    if (l === undefined || r === undefined) continue;
    (m.get(name) ?? m.set(name, []).get(name)).push([l, r]);
  }
  return m;
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

// One comparison: frontend f, windows around [li, fi]. Returns null when a window is too thin or empty.
function compare(panel, ranges, f, li, fi, len, ownChanges, control = null) {
  const before = [], after = [];
  for (let i = li - len + 1; i <= li; i++) before.push(i);
  for (let i = fi; i < fi + len; i++) after.push(i);
  if (before[0] < 0 || after.at(-1) >= panel.days.length) return null;
  const keep = (a) => a.filter((i) => !LEFT_OUT.has(panel.days[i]));
  const b = keep(before), a = keep(after);
  const need = Math.ceil(len / 2);
  if (b.length < need || a.length < need) return null;
  const lo = before[0], hi = after.at(-1);
  // The frontend must have no other fee change of its own in either window.
  for (const [l, r] of ownChanges) if (!(l === li && r === fi) && l <= hi && r >= lo) return null;
  const s = panel.f.get(f);
  const sum = (arr, idx) => idx.reduce((t, i) => t + arr[i], 0);
  const sB = sum(s.inn, b), sA = sum(s.inn, a);
  if (sB <= 0 || sA <= 0) return { thin: true, beforeUsd: sB, afterUsd: sA };
  // Control: every other frontend, leaving out any with a fee change of its own inside the windows.
  const drop = [s];
  for (const [g, rs] of ranges) if (g !== f && panel.f.has(g) && rs.some(([l, r]) => l <= hi && r >= lo)) drop.push(panel.f.get(g));
  // With an outside control (CoW Swap's daily volume, D14) it replaces the other frontends; a day it lacks makes the window unusable.
  if (control && [...b, ...a].some((i) => !(control[i] > 0))) return null;
  const ctl = control ? (idx) => idx.reduce((t, i) => t + control[i], 0) : (idx) => idx.reduce((t, i) => t + panel.total[i] - drop.reduce((u, d) => u + d.inn[i], 0), 0);
  const cB = ctl(b), cA = ctl(a);
  if (cB <= 0 || cA <= 0) return null;
  const cost = (inn, out, idx) => { const i = sum(inn, idx); return i > 0 ? 1e4 * (1 - sum(out, idx) / i) : null; };
  const c = (inn, out) => { const x = cost(inn, out, b), y = cost(inn, out, a); return x === null || y === null ? null : y - x; };
  return {
    dv: Math.log(sA / a.length / (sB / b.length)) - Math.log(cA / a.length / (cB / b.length)),
    dcost: c(s.inn, s.out), dcost2: c(s.in2, s.out2), beforeUsd: sB, afterUsd: sA,
  };
}

// Placebo dates for one event: same frontend, same gap, no own fee change in either window, volume in both.
function placeboDates(panel, ranges, f, gap, len, own, control) {
  const out = [];
  for (let li = len - 1; li + gap + len - 1 < panel.days.length; li++) {
    const r = compare(panel, ranges, f, li, li + gap, len, own, control);
    if (r && !r.thin) out.push(r);
  }
  return out;
}

function summarize(est, placebo) {
  const abs = Float64Array.from(placebo, Math.abs).sort();
  const n = placebo.length;
  const q95 = abs[Math.ceil(0.95 * n) - 1];
  let ge = 0;
  for (const v of placebo) if (Math.abs(v) >= Math.abs(est)) ge++;
  const sorted = Float64Array.from(placebo).sort();
  const pct = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const mde = 2.8 * sd(Array.from(placebo));
  const bins = 41, span = Math.max(abs[n - 1], Math.abs(est)) || 1;
  const hist = new Array(bins).fill(0);
  for (const v of placebo) hist[Math.min(bins - 1, Math.floor(((v + span) / (2 * span)) * bins))]++;
  return {
    estimate: est, lo: est - q95, hi: est + q95, p: (ge + 1) / (n + 1), pMin: 1 / (n + 1), mde, placeboSd: sd(Array.from(placebo)),
    underpowered: !(est - q95 > 0 || est + q95 < 0) || Math.abs(est) < mde,
    percentiles: { p01: pct(0.01), p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95), p99: pct(0.99) },
    histogram: { min: -span, max: span, counts: hist },
  };
}

// Slope through zero of y on x across events, with the placebo distribution made by swapping each event's real y for a placebo date's y.
function slopeRun(x, realY, candY, reps, seed) {
  const rng = mulberry32(seed);
  const est = slope(x, realY);
  const placebo = new Float64Array(reps);
  const y = new Array(x.length);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < x.length; i++) y[i] = candY[i][Math.floor(rng() * candY[i].length)];
    placebo[r] = slope(x, y);
  }
  return summarize(est, placebo);
}

// events: [{ frontend, lastDayBefore, firstDayAfter, from, to }]. Returns the full result for one setting.
export function estimate(panel, ranges, events, { len = WINDOW_DAYS, shift = SHIFT_BPS, reps = REPS, seed = SEED, skip = () => false, control = null } = {}) {
  const used = [], dropped = [];
  for (const e of events) {
    const base = { frontend: e.frontend, lastDayBefore: e.lastDayBefore, firstDayAfter: e.firstDayAfter, from: e.from, to: e.to };
    if (skip(e)) { dropped.push({ ...base, reason: 'left out by this check' }); continue; }
    const li = panel.at.get(e.lastDayBefore), fi = panel.at.get(e.firstDayAfter);
    const own = ranges.get(e.frontend) ?? [];
    const c = compare(panel, ranges, e.frontend, li, fi, len, own, control);
    if (!c) { dropped.push({ ...base, reason: 'window too short, or another fee change of its own inside it' }); continue; }
    if (c.beforeUsd < MIN_BEFORE_USD) { dropped.push({ ...base, reason: `under $100,000 in the days before (${Math.round(c.beforeUsd)})` }); continue; }
    if (c.thin) { dropped.push({ ...base, reason: 'no volume after the change' }); continue; }
    const cands = placeboDates(panel, ranges, e.frontend, fi - li, len, own, control);
    if (!cands.length) { dropped.push({ ...base, reason: 'no placebo date with volume in both windows' }); continue; }
    used.push({ ...base, ...c, df: Math.log((e.to + shift) / (e.from + shift)), dfee: e.to - e.from, cands });
  }
  const out = { events: used.map(({ cands, ...u }) => ({ ...u, placeboDates: cands.length })), dropped, shift, len, usable: used.length };
  if (used.length < 2) return { ...out, e1: null, e2: null, e2Bucket: null };
  const x1 = used.map((u) => u.df), x2 = used.map((u) => u.dfee);
  out.e1 = slopeRun(x1, used.map((u) => u.dv), used.map((u) => u.cands.map((c) => c.dv)), reps, seed);
  const hasCost = used.filter((u) => u.dcost !== null && u.cands.some((c) => c.dcost !== null));
  out.e2 = hasCost.length < 2 ? null : slopeRun(hasCost.map((u) => u.dfee), hasCost.map((u) => u.dcost), hasCost.map((u) => u.cands.filter((c) => c.dcost !== null).map((c) => c.dcost)), reps, seed + 1);
  const b = used.filter((u) => u.dcost2 !== null && u.cands.some((c) => c.dcost2 !== null));
  out.e2Bucket = b.length < 2 ? null : slopeRun(b.map((u) => u.dfee), b.map((u) => u.dcost2), b.map((u) => u.cands.filter((c) => c.dcost2 !== null).map((c) => c.dcost2)), reps, seed + 2);
  out.e2Events = hasCost.length;
  out.e2BucketEvents = b.length;
  return out;
}

// The main result plus the checks PREREG.md section 3 lists. Each check is a full run of its own.
// venues: more outside controls (FR-21), [{ key, name, series }] on the panel's days; each is its own check, like CoW Swap.
export function estimateAll(panel, ranges, events, { cow, venues = [], ...opts } = {}) {
  const main = estimate(panel, ranges, events, opts);
  const byFrontend = new Map();
  for (const e of main.events) byFrontend.set(e.frontend, Math.max(byFrontend.get(e.frontend) ?? 0, e.beforeUsd));
  const largest = [...byFrontend].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const touchesExploit = (e) => { const l = panel.at.get(e.lastDayBefore), r = panel.at.get(e.firstDayAfter); return EXPLOIT_DAYS.some((d) => { const i = panel.at.get(d); return i >= l - WINDOW_DAYS + 1 && i <= r + WINDOW_DAYS - 1; }); };
  const exploitHit = events.filter(touchesExploit).map((e) => e.frontend);
  const checks = {
    dropLargest: { label: `Drop the largest frontend (${largest})`, skipped: largest, ...estimate(panel, ranges, events, { ...opts, skip: (e) => e.frontend === largest }) },
    shift2: { label: 'Fee shift 2 bps instead of 5', ...estimate(panel, ranges, events, { ...opts, shift: 2 }) },
    shift10: { label: 'Fee shift 10 bps instead of 5', ...estimate(panel, ranges, events, { ...opts, shift: 10 }) },
    noExploit: { label: 'Leave out events whose windows touch the exploit pause', skipped: exploitHit, ...estimate(panel, ranges, events, { ...opts, skip: touchesExploit }) },
  };
  if (cow) checks.cowControl = { label: 'CoW Swap on DefiLlama as the control (D14)', ...estimate(panel, ranges, events, { ...opts, control: cow }) };
  for (const v of venues) checks[`control_${v.key}`] = { label: `${v.name} on DefiLlama as the control`, ...estimate(panel, ranges, events, { ...opts, control: v.series }) };
  if (events.some((e) => e.stable30)) checks.days30 = { label: '30-day windows, on events stable for 30 days on both sides', ...estimate(panel, ranges, events, { ...opts, len: 30, skip: (e) => !e.stable30 }) };
  return { main, checks };
}

// PREREG.md section 3: the protocol fee switch hit every frontend on one day, so it is reported on its own, descriptive only, with CoW Swap as the control.
// Change = log(after / before) of all 1Click volume minus the same for CoW Swap, over WINDOW_DAYS on each side. No placebo, so no interval.
export function feeSwitch(panel, cow, firstDayAfter, len = WINDOW_DAYS) {
  const fi = panel.at.get(firstDayAfter);
  if (fi === undefined || fi < len || fi + len > panel.days.length) return null;
  const before = Array.from({ length: len }, (_, k) => fi - len + k), after = Array.from({ length: len }, (_, k) => fi + k);
  const keep = (a) => a.filter((i) => !LEFT_OUT.has(panel.days[i]));
  const b = keep(before), a = keep(after);
  if ([...b, ...a].some((i) => !(cow[i] > 0))) return null;
  const mean = (arr, idx) => idx.reduce((t, i) => t + arr[i], 0) / idx.length;
  const intents = Math.log(mean(panel.total, a) / mean(panel.total, b)), control = Math.log(mean(cow, a) / mean(cow, b));
  return { firstDayAfter, lastDayBefore: panel.days[fi - 1], len, intentsLogChange: intents, cowLogChange: control, change: intents - control, descriptive: true };
}
