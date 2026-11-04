// FR-21 coverage board on /method/. Pure and type-annotations only, so Node runs it in tests and the site imports it.
type Route = { route: string; status: 'quoted' | 'similar' | 'not quoted'; swaps: number; usd: number; share: number };
type Part = { routes: number; swaps: number; usd: number; share: number };
export type TokenBoard = {
  from: string; to: string; days: number; routes: number; swaps: number; usd: number;
  byStatus: Record<'quoted' | 'similar' | 'not quoted', Part>;
  largest: Route[]; largestNotQuoted: Route[];
};

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`);
const STATUS = { quoted: 'Quoted', similar: 'Same tokens, other chains', 'not quoted': 'Not quoted' } as const;

export function tokenBoardView(b: TokenBoard | null) {
  if (!b) return null;
  const q = b.byStatus.quoted, s = b.byStatus.similar, n = b.byStatus['not quoted'];
  return {
    summary: `Over ${b.days} days (${b.from} to ${b.to}), 1Click moved ${money(b.usd)} on ${b.routes.toLocaleString('en-US')} routes. The 4 routes our quotes sample carry ${pct(q.share)} of it. The same tokens on other chains carry ${pct(s.share)}, where the fee should be close but is not measured. The other ${pct(n.share)} is not quoted.`,
    rows: b.largest.map((r) => [r.route, money(r.usd), pct(r.share), STATUS[r.status]]),
    missing: b.largestNotQuoted.slice(0, 5).map((r) => `${r.route} (${pct(r.share)})`).join(', '),
  };
}
