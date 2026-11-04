// Picks the events for E1 and E2 from the census, using fee rates and dates only (PREREG.md section 2).
// Usage: node analysis/prereg_events.mjs <census json>
import { readFileSync } from 'node:fs';

export const MIN_CHANGE_BPS = 5;
export const MIN_STABLE_DAYS = 14;
export const MAX_TRANSITION_DAYS = 7;

const NOT_A_FRONTEND = new Set(['referral:(none)', 'referral:']);
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

export function selectEvents(events) {
  return events
    .filter((e) => e.key.startsWith('referral:') && !NOT_A_FRONTEND.has(e.key))
    .filter((e) => Math.abs(e.to - e.from) >= MIN_CHANGE_BPS)
    .filter((e) => e.daysBefore >= MIN_STABLE_DAYS && e.daysAfter >= MIN_STABLE_DAYS)
    .filter((e) => daysBetween(e.lastDayBefore, e.firstDayAfter) <= MAX_TRANSITION_DAYS)
    .map((e) => ({ frontend: e.key.slice('referral:'.length), lastDayBefore: e.lastDayBefore, firstDayAfter: e.firstDayAfter, from: e.from, to: e.to }));
}

if (process.argv[1]?.endsWith('prereg_events.mjs')) {
  const census = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(selectEvents(census.events), null, 1));
}
