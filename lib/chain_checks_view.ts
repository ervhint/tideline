// AC-2.3 on /method/: how completely each frozen chain day was read, from data/published/chain_days.json.
// Pure and type-annotations only, so Node runs it in tests and the site imports it.
type Day = { day: string; swaps: number; unpricedSwaps: number; census: { listed: number; read: number } };
export type ChainDays = { days: Day[]; gaps: string[] };

const n = (x: number) => x.toLocaleString('en-US');
const extra = (d: Day) => d.census.read - d.census.listed;
const many = (k: number, one: string, more: string) => `${k} ${k === 1 ? one : more}`;

export function chainChecksView(doc: ChainDays | null, show = 7) {
  if (!doc?.days?.length) return null;
  const days = doc.days, over = days.filter((d) => extra(d) > 0), under = days.filter((d) => extra(d) < 0);
  const what = (d: Day) =>
    extra(d) > 0 ? `${n(extra(d))} more read than listed: FastNEAR sent ${extra(d) === 1 ? 'one twice' : 'some twice'}. Kept in this frozen day; new days drop them.`
    : extra(d) < 0 ? `${n(-extra(d))} listed but not read.` : 'Nothing.';
  return {
    rows: days.slice(-show).reverse().map((d) => [d.day, n(d.census.listed), n(d.census.read), n(d.swaps), n(d.unpricedSwaps), what(d)]),
    summary: `${days.length} frozen days, ${days[0].day} to ${days.at(-1)!.day}, ${doc.gaps.length ? `${many(doc.gaps.length, 'gap', 'gaps')} (${doc.gaps.join(', ')})` : 'no gaps'}. ${under.length ? `${many(under.length, 'day', 'days')} read fewer transactions than listed.` : 'Every day read every listed transaction.'}${over.length ? ` On ${many(over.length, 'day', 'days')} a few more were read than listed (${over.map((d) => `${d.day}: ${n(extra(d))}`).join(', ')}).` : ''} The newest ${Math.min(show, days.length)} days are shown. Swaps through the Confidential Intents treasury count as paired confidential flows, which are not a full count of private swaps.`,
  };
}
