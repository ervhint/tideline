// Finds dated fee changes per fee recipient and per referral from fee rates alone.
// Blind to outcomes on purpose: it reads no USD amounts, so the event list can be frozen before any volume response is seen.
// A step is the most common total fee changing between two stable periods of at least MIN_RUN_DAYS each.
// Usage: node analysis/event_census.mjs <dir of daily .jsonl.gz files>
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const MIN_SWAPS_PER_DAY = 10;
const MIN_RUN_DAYS = 5;
const MIN_SHARE = 0.7; // The most common fee must cover this share of the group's swaps that day.

const dir = process.argv[2];
const groups = new Map(); // "kind:name" -> day -> fee bps -> count
const add = (key, day, fee) => {
  const days = groups.get(key) ?? groups.set(key, new Map()).get(key);
  const fees = days.get(day) ?? days.set(day, new Map()).get(day);
  fees.set(fee, (fees.get(fee) ?? 0) + 1);
};

const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl.gz')).sort();
for (const f of files) {
  const day = f.slice(0, 10);
  const text = gunzipSync(readFileSync(`${dir}/${f}`)).toString();
  if (!text) continue;
  for (const line of text.split('\n')) {
    const { referral, appFees } = JSON.parse(line);
    const total = appFees.reduce((s, a) => s + a.fee, 0);
    add(`referral:${referral ?? '(none)'}`, day, total);
    for (const a of appFees) add(`recipient:${a.recipient}`, day, a.fee);
  }
}

function dailyModes(days) {
  const out = [];
  for (const [day, fees] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const n = [...fees.values()].reduce((s, c) => s + c, 0);
    const [fee, count] = [...fees].sort((a, b) => b[1] - a[1])[0];
    if (n >= MIN_SWAPS_PER_DAY && count / n >= MIN_SHARE) out.push({ day, fee });
  }
  return out;
}

function runs(modes) {
  const out = [];
  for (const m of modes) {
    const r = out.at(-1);
    if (r && r.fee === m.fee) { r.end = m.day; r.days++; } else out.push({ fee: m.fee, start: m.day, end: m.day, days: 1 });
  }
  return out;
}

const events = [];
const summary = [];
for (const [key, days] of groups) {
  const stable = runs(dailyModes(days)).filter((r) => r.days >= MIN_RUN_DAYS);
  if (!stable.length) continue;
  summary.push({ key, activeDays: days.size, stablePeriods: stable.map((r) => `${r.fee}bps ${r.start}..${r.end}`).join(' | ') });
  for (let i = 1; i < stable.length; i++) {
    if (stable[i].fee !== stable[i - 1].fee) {
      events.push({ key, lastDayBefore: stable[i - 1].end, firstDayAfter: stable[i].start, from: stable[i - 1].fee, to: stable[i].fee, daysBefore: stable[i - 1].days, daysAfter: stable[i].days });
    }
  }
}

events.sort((a, b) => a.firstDayAfter.localeCompare(b.firstDayAfter));
console.log(JSON.stringify({ daysRead: files.length, groups: groups.size, groupsWithStableFee: summary.length, events, summary: summary.sort((a, b) => b.activeDays - a.activeDays).slice(0, 40) }, null, 1));
