// T3: splits a run of past UTC days into jobs of a few days each, for the chain-backfill matrix.
// A job has a 6 hour limit and a day takes about 95 minutes, so a job holds at most PER_JOB days.
// Usage: node pipeline/backfill_plan.mjs FROM TO [PER_JOB]   prints the JSON matrix, e.g. {"include":[{"job":1,"days":"2026-10-04 2026-10-05 2026-10-06"}]}
import { pathToFileURL } from 'node:url';

const DAY_MS = 86_400_000;
export const PER_JOB = 3;
export const MAX_DAYS = 90;

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function daysBetween(from, to) {
  if (!isDay(from) || !isDay(to)) throw new Error('days must be YYYY-MM-DD');
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (b < a) throw new Error('"to" is before "from"');
  const n = (b - a) / DAY_MS + 1;
  if (n > MAX_DAYS) throw new Error(`${n} days is more than the ${MAX_DAYS} a backfill may hold`);
  return Array.from({ length: n }, (_, i) => new Date(a + i * DAY_MS).toISOString().slice(0, 10));
}

export function plan(from, to, perJob = PER_JOB) {
  if (!Number.isInteger(perJob) || perJob < 1 || perJob > PER_JOB) throw new Error(`a job holds 1 to ${PER_JOB} days`);
  const days = daysBetween(from, to);
  const include = [];
  for (let i = 0; i < days.length; i += perJob) include.push({ job: include.length + 1, days: days.slice(i, i + perJob).join(' ') });
  return { include };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [from, to, per] = process.argv.slice(2);
  console.log(JSON.stringify(plan(from, to, per ? Number(per) : PER_JOB)));
}
