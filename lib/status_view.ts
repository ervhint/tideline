// NFR-6: is the data late? Pure and type-annotations only, so Node runs it in tests and the site imports it.
// A published file's asOf only moves when its numbers move, so it cannot tell a late job from a quiet day.
// The last frozen UTC day can: yesterday's should be frozen within a day.
export type Freshness = { stale: boolean; title: string; body: string };

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function freshness(lastFrozenDay: string | null, now: Date): Freshness {
  const late: string[] = [];
  // The day before yesterday must be frozen by now: that allows a full day for the late GitHub schedule.
  if (!lastFrozenDay || Date.parse(`${lastFrozenDay}T00:00:00Z`) < Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z') - 2 * DAY)
    late.push(lastFrozenDay ? `The last finished day in the data is ${day(lastFrozenDay)}.` : 'No finished day could be read.');
  if (!late.length) return { stale: false, title: '', body: '' };
  const after = lastFrozenDay ? 'Numbers below are from then, and nothing is filled in for the gap.' : 'Readings that need one show as Not Measured.';
  return { stale: true, title: 'Data Is Late', body: `${late.join(' ')} ${after}` };
}
