// FR-21 coverage board on /method/. Pure and type-annotations only, so Node runs it in tests and the site imports it.
type Status = 'both' | 'one' | 'none';
type Route = { route: string; status: Status; swaps: number; usd: number; share: number; swapShare: number };
type Part = { swaps: number; usd: number; swapShare: number; usdShare: number };
export type TokenBoard = {
  from: string; to: string; days: number; routes: number; swaps: number; usd: number;
  byStatus: Record<Status, Part>;
  largest: Route[]; largestOneSide: Route[]; largestUnpriced: Route[];
};

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`);
const STATUS = { both: 'Both sides', one: 'One side', none: 'Neither side' } as const;

export function tokenBoardView(b: TokenBoard | null) {
  if (!b?.byStatus?.both) return null;
  const { both, one, none } = b.byStatus;
  return {
    summary: `Over ${b.days} days (${b.from} to ${b.to}), the frozen days hold ${b.swaps.toLocaleString('en-US')} swaps on ${b.routes.toLocaleString('en-US')} routes. ${pct(both.swapShare)} of the swaps, ${pct(both.usdShare)} of the USD, have a price on both sides; only these are costed on Follow the Fee. ${pct(one.swapShare)} have a price on one side, so they count in volume and size but not in cost. ${pct(none.swapShare)} have no price at all and are counted, never guessed. Swaps through the Confidential Intents treasury are paired confidential flows, not a full count of private swaps, and Follow the Fee reports them apart.`,
    rows: b.largest.map((r) => [r.route, money(r.usd), pct(r.share), STATUS[r.status]]),
    missing: b.largestOneSide.slice(0, 5).map((r) => `${r.route} (${pct(r.share)})`).join(', '),
  };
}
