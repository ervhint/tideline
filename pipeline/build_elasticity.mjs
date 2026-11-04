// Reads the daily snapshot and the frozen events, writes data/published/elasticity.json (U5, E1 and E2).
// Usage: node pipeline/build_elasticity.mjs   (set SNAPSHOT_DIR / OUT / REPS to change where it reads, writes, or how many placebo draws)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { selectEvents } from '../analysis/prereg_events.mjs';
import { passThroughRef } from '../analysis/passthrough_ref.mjs';
import { changeRanges, estimateAll, feeSwitch, panelFromRows, REPS, SEED } from '../analysis/elasticity.mjs';

const dir = process.env.SNAPSHOT_DIR ?? 'data/snapshot/days';
const out = process.env.OUT ?? 'data/published/elasticity.json';
const reps = Number(process.env.REPS ?? REPS);
const censusFile = 'data/census/fee-events-full-2026-11-01.json';

const files = readdirSync(dir).filter((f) => f.endsWith('.csv.gz')).sort();
const days = files.map((f) => f.slice(0, 10));
const rows = files.flatMap((f) => gunzipSync(readFileSync(`${dir}/${f}`)).toString().split('\n').slice(1).filter(Boolean).map((l) => {
  const [day, referral, , bucket, , usd_in, usd_out] = l.split(',');
  return { day, referral, bucket, usd_in: +usd_in, usd_out: +usd_out };
}));

const census = JSON.parse(readFileSync(censusFile, 'utf8'));
const panel = panelFromRows(days, rows);
const ranges = changeRanges(panel, census.events);
const stable30 = new Set(census.events.filter((e) => e.daysBefore >= 30 && e.daysAfter >= 30).map((e) => `${e.key}|${e.lastDayBefore}`));
const events = selectEvents(census.events).map((e) => ({ ...e, stable30: stable30.has(`referral:${e.frontend}|${e.lastDayBefore}`) }));

// CoW Swap's daily volume from DefiLlama (data/snapshot/cow_daily.json), on the same days as the panel. A missing day stays 0, which makes its windows unusable.
const cowDays = new Map(JSON.parse(readFileSync('data/snapshot/cow_daily.json', 'utf8')).days.map((d) => [d.day, d.volume]));
const cow = Float64Array.from(days, (d) => cowDays.get(d) ?? 0);

// More control venues (FR-21, data/snapshot/control_venues.json), on the same days the same way.
const VENUES = 'data/snapshot/control_venues.json';
const venues = existsSync(VENUES) ? Object.entries(JSON.parse(readFileSync(VENUES, 'utf8')).venues).map(([key, v]) => {
  const m = new Map(v.days.map((d) => [d.day, d.volume]));
  return { key, name: v.name, series: Float64Array.from(days, (d) => m.get(d) ?? 0) };
}) : [];

const result = estimateAll(panel, ranges, events, { reps, cow, venues });
// The protocol fee switch: revenue steps up on 2026-02-23 in data/snapshot/defillama_daily.json (about 1,300 a day before, 6,275 that day, rising after), which confirms the date.
const switchResult = feeSwitch(panel, cow, '2026-02-23');
const switchOthers = venues.map((v) => ({ name: v.name, ...feeSwitch(panel, v.series, '2026-02-23') })).filter((s) => s.change !== undefined);
// FR-08: pass-through against Binance prices, from the window totals pipeline/pull_passthrough.mjs saved.
const REF = 'data/snapshot/passthrough_ref.json';
const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : null;
const e2Reference = ref && { label: 'Pass-through against Binance prices (FR-08)', prices: ref.prices, ...passThroughRef(ref.events) };
const pack = (r) => ({ ...r, events: r.events.map(({ cands, ...e }) => e) });
const fmt = (v) => v.toFixed(2);
const numbers = (m, day) => [m.e1 && { id: 'e1.elasticity', value: m.e1.estimate, unit: 'elasticity', display: fmt(m.e1.estimate), asOf: day, plain: `A 1% higher fee changed volume by ${fmt(m.e1.estimate)}%, interval ${fmt(m.e1.lo)} to ${fmt(m.e1.hi)}. 1Click only.`, query: 'estimate() in analysis/elasticity.mjs on data/snapshot/days; npm run elasticity', source: 'Explorer snapshot' },
  m.e2 && { id: 'e2.passthrough', value: m.e2.estimate, unit: 'ratio', display: fmt(m.e2.estimate), asOf: day, plain: `Of each fee change, users paid ${fmt(m.e2.estimate)}, interval ${fmt(m.e2.lo)} to ${fmt(m.e2.hi)}. 1Click only.`, query: 'estimate() in analysis/elasticity.mjs, e2', source: 'Explorer snapshot' }].filter(Boolean);
const doc = {
  asOf: `${days.at(-1)}T23:59:59Z`,
  source: 'Explorer snapshot, 1Click only',
  prereg: 'PREREG.md, frozen 2026-11-01',
  seed: SEED, reps, daysRead: days.length, frozenEvents: events.length,
  main: pack(result.main),
  checks: Object.fromEntries(Object.entries(result.checks).map(([k, v]) => [k, pack(v)])),
  numbers: numbers(result.main, days.at(-1)),
  feeSwitch: switchResult && { ...switchResult, label: 'Protocol fee switch, 23 Feb 2026 (descriptive, CoW Swap as the control)', dateSource: 'DefiLlama daily revenue steps up on 2026-02-23', others: switchOthers.map(({ name, cowLogChange, change }) => ({ name, venueLogChange: cowLogChange, change })) },
  e2Reference,
  notRun: ref ? [] : ['Pass-through against Binance prices (FR-08): run node pipeline/pull_passthrough.mjs first'],
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
const m = doc.main;
console.log(`${events.length} frozen events, ${m.usable} usable -> ${out}`);
if (m.e1) console.log(`E1 elasticity ${m.e1.estimate.toFixed(2)} [${m.e1.lo.toFixed(2)}, ${m.e1.hi.toFixed(2)}] p=${m.e1.p.toFixed(4)} MDE ${m.e1.mde.toFixed(2)} underpowered=${m.e1.underpowered}`);
if (m.e2) console.log(`E2 pass-through ${m.e2.estimate.toFixed(2)} [${m.e2.lo.toFixed(2)}, ${m.e2.hi.toFixed(2)}] on ${m.e2Events} events`);
for (const d of m.dropped) console.log('dropped', d.frontend, d.lastDayBefore, d.reason);
