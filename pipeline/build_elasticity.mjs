// E1 elasticity and E2 pass-through on the frozen chain days (T5, PREREG.md sections 3 and 4) -> data/published/elasticity.json.
// No network: reads data/chain/*.jsonl and the DefiLlama control venues in data/snapshot. CHAIN_DIR / OUT / REPS override.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDayFile } from '../analysis/chain_day.mjs';
import {
  census, panelOf, changeRanges, estimateAll, REPS, SEED, MIN_EVENTS, MIN_RUN_DAYS, MIN_CHANGE_BPS, MAX_GAP_DAYS, LEFT_OUT_DAYS,
} from '../analysis/elasticity.mjs';

const dir = process.env.CHAIN_DIR ?? 'data/chain';
const out = process.env.OUT ?? 'data/published/elasticity.json';
const reps = Number(process.env.REPS ?? REPS);

const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
if (!files.length) throw new Error(`no frozen chain days in ${dir}`);
const days = files.map((f) => {
  const p = parseDayFile(readFileSync(`${dir}/${f}`, 'utf8'), f.slice(0, 10));
  if (p.problems.length) throw new Error(`${f}: ${p.problems.join('; ')}`);
  return p;
});

const cen = census(days);
const panel = panelOf(days);
const ranges = changeRanges(panel, cen);

// Control venues from DefiLlama on the panel's calendar days (PREREG 3 checks). A day a venue lacks stays 0, which makes its windows unusable.
const series = (list) => { const m = new Map(list.map((d) => [d.day, d.volume])); return Float64Array.from(panel.days, (d) => m.get(d) ?? 0); };
const cow = JSON.parse(readFileSync('data/snapshot/cow_daily.json', 'utf8'));
const others = JSON.parse(readFileSync('data/snapshot/control_venues.json', 'utf8'));
const venues = [{ key: 'cow', name: 'CoW Swap', series: series(cow.days) }, ...Object.entries(others.venues).map(([key, v]) => ({ key, name: v.name, series: series(v.days) }))];

// Steps that came close: at least 5 bps, with one side a run of 7 days or more, and which rule each one missed. Shown, never used.
const nearMisses = cen.frontends.flatMap((f) => f.runs.slice(1).map((b, i) => ({ a: f.runs[i], b, frontend: f.frontend })))
  .filter(({ a, b }) => Math.abs(b.fee - a.fee) >= MIN_CHANGE_BPS && (a.days >= MIN_RUN_DAYS || b.days >= MIN_RUN_DAYS))
  .filter(({ a, b, frontend }) => !cen.events.some((e) => e.frontend === frontend && e.lastDayBefore === a.end))
  .map(({ a, b, frontend }) => {
    const gap = (Date.parse(b.start) - Date.parse(a.end)) / 86_400_000;
    const missed = [a.days < MIN_RUN_DAYS && `${a.days} days at the old rate (${MIN_RUN_DAYS} needed)`, b.days < MIN_RUN_DAYS && `${b.days} days at the new rate (${MIN_RUN_DAYS} needed)`, gap > MAX_GAP_DAYS && `${gap} days from the old rate to the new (at most ${MAX_GAP_DAYS})`].filter(Boolean);
    return { frontend, from: a.fee, to: b.fee, lastDayBefore: a.end, firstDayAfter: b.start, daysBefore: a.days, daysAfter: b.days, missed: missed.join(', ') };
  });

const result = cen.events.length ? estimateAll(panel, ranges, cen.events, { venues, reps }) : null;
const pack = (r) => r && { ...r, events: r.events };
const main = result ? pack(result.main) : { usable: 0, events: [], dropped: [], e1: null, e2: null, e2Bucket: null, e2Events: 0, e2BucketEvents: 0 };
const usable = main.usable;
const notMeasured = usable >= MIN_EVENTS ? null : cen.events.length === 0
  ? `No fee change passes the PREREG.md section 3 rules in the ${days.length} frozen days: a frontend must hold one rate for ${MIN_RUN_DAYS} days, then another rate at least ${MIN_CHANGE_BPS} bps away for ${MIN_RUN_DAYS} days.`
  : `Only ${usable} of the ${cen.events.length} fee changes found are usable, under the ${MIN_EVENTS} needed.`;

const doc = {
  asOf: `${days.at(-1).head.day}T23:59:59Z`,
  source: 'intents.near token_diff swaps on frozen chain days (data/chain)',
  prereg: 'PREREG.md sections 3 and 4, committed 5 Nov 2026 (bfda0f2)',
  seed: SEED, reps,
  from: days[0].head.day, to: days.at(-1).head.day, daysRead: days.length, leftOutDays: LEFT_OUT_DAYS,
  census: {
    frontends: cen.frontends.length,
    withStableRun: cen.frontends.filter((f) => f.runs.some((r) => r.days >= MIN_RUN_DAYS)).length,
    changes: cen.frontends.reduce((t, f) => t + f.changes.length, 0),
    events: cen.events,
    nearMisses,
  },
  frozenEvents: cen.events.length,
  main,
  checks: result ? Object.fromEntries(Object.entries(result.checks).map(([k, v]) => [k, pack(v)])) : {},
  notMeasured,
  notRun: notMeasured ? ['E1, E2 and their checks: no estimate without at least 3 usable fee changes (PREREG.md section 3)'] : [],
  query: 'census and estimateAll in analysis/elasticity.mjs over data/chain/*.jsonl, by pipeline/build_elasticity.mjs; npm run elasticity',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
console.log(`${days.length} chain days ${doc.from} to ${doc.to}: ${cen.frontends.length} frontends, ${doc.census.changes} rate steps, ${cen.events.length} events, ${usable} usable -> ${out}`);
if (notMeasured) console.log(`Q1 Not Measured: ${notMeasured}`);
for (const m of nearMisses) console.log(`near miss ${m.frontend} ${m.from} -> ${m.to} bps (${m.lastDayBefore} / ${m.firstDayAfter}): ${m.missed}`);
if (main.e1) console.log(`E1 ${main.e1.estimate.toFixed(2)} [${main.e1.lo.toFixed(2)}, ${main.e1.hi.toFixed(2)}] p=${main.e1.p.toFixed(4)} MDE ${main.e1.mde.toFixed(2)} underpowered=${main.e1.underpowered}`);
if (main.e2) console.log(`E2 ${main.e2.estimate.toFixed(2)} [${main.e2.lo.toFixed(2)}, ${main.e2.hi.toFixed(2)}] on ${main.e2Events} events`);
