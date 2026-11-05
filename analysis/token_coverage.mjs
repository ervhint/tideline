// FR-21 coverage board on frozen chain days (T6): which routes carry the swaps, and how many of them Follow the Fee can cost.
// A swap is in Follow the Fee only with a price on both sides (PREREG.md section 7). Pure: parsed day files and token names in, the board out.
import { llamaId } from './chain_swaps.mjs';

export const CHAIN_NAMES = {
  eth: 'Ethereum', arb: 'Arbitrum', base: 'Base', op: 'Optimism', bsc: 'BNB Chain', pol: 'Polygon', avax: 'Avalanche', gnosis: 'Gnosis',
  bera: 'Berachain', sol: 'Solana', btc: 'Bitcoin', tron: 'Tron', ton: 'TON', near: 'NEAR', zec: 'Zcash', xrp: 'XRP Ledger', doge: 'Dogecoin',
  ltc: 'Litecoin', sui: 'Sui', aptos: 'Aptos', ada: 'Cardano', bch: 'Bitcoin Cash', stellar: 'Stellar', dash: 'Dash', plasma: 'Plasma', aleo: 'Aleo',
};
const HOT_CHAIN = { 1: 'eth', 10: 'op', 56: 'bsc', 137: 'pol', 1117: 'ton', 8453: 'base', 42161: 'arb', 43114: 'avax' };

// The chain a token lives on, read from its intents.near id alone.
export function chainOf(id) {
  const hot = id.match(/^nep245:v2_1\.omni\.hot\.tg:(\d+)_/);
  if (hot) return HOT_CHAIN[hot[1]] ?? `chain ${hot[1]}`;
  const omft = id.match(/^nep141:([a-z]+)(?:-[0-9a-zA-Z]+)?\.omft\.near$/);
  if (omft) return omft[1];
  if (/\.factory\.bridge\.near$/.test(id)) return 'eth';
  return 'near';
}

const short = (s) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);
// "USDT (Tron)" with a name from ft_metadata (data/labels/tokens.json); otherwise the shortened contract and the chain.
export function tokenLabel(id, names = {}) {
  const chain = CHAIN_NAMES[chainOf(id)] ?? chainOf(id);
  const sym = names[id]?.symbol;
  return `${sym ?? short(id.replace(/^nep\d+:/, '').replace(/\.omft\.near$/, '').replace(/^v2_1\.omni\.hot\.tg:\d+_/, ''))} (${chain})`;
}

// A token is priced on a day when it maps to a DefiLlama id that the day file holds a price for (and, on nep141, decimals).
export const tokenPriced = (day, id) => {
  const l = llamaId(id);
  return !!l && day.priceIds.has(l) && (id.startsWith('nep245:') || day.decimals[id] != null);
};

const STATUSES = ['both', 'one', 'none'];

// days: parsed day files (routes, decimals, priceIds). Returns totals per status and the largest routes.
export function coverageBoard(days, names = {}, { top = 10 } = {}) {
  const routes = new Map();
  const by = Object.fromEntries(STATUSES.map((s) => [s, { swaps: 0, usd: 0 }]));
  for (const d of days) {
    for (const r of d.routes) {
      const a = tokenPriced(d, r.from), b = tokenPriced(d, r.to);
      const status = a && b ? 'both' : a || b ? 'one' : 'none';
      by[status].swaps += r.n; by[status].usd += r.vol;
      const k = `${r.from}>${r.to}`;
      const x = routes.get(k) ?? routes.set(k, { from: r.from, to: r.to, swaps: 0, usd: 0, status }).get(k);
      x.swaps += r.n; x.usd += r.vol; x.status = status; // the status on the latest day it was seen
    }
  }
  const swaps = STATUSES.reduce((t, s) => t + by[s].swaps, 0), usd = STATUSES.reduce((t, s) => t + by[s].usd, 0);
  for (const s of STATUSES) Object.assign(by[s], { swapShare: swaps ? by[s].swaps / swaps : 0, usdShare: usd ? by[s].usd / usd : 0 });
  const all = [...routes.values()].map((x) => ({ ...x, route: `${tokenLabel(x.from, names)} to ${tokenLabel(x.to, names)}` }));
  const pick = (xs, key) => xs.sort((p, q) => q[key] - p[key] || (p.route < q.route ? -1 : 1)).slice(0, top)
    .map(({ route, status, swaps: n, usd: u }) => ({ route, status, swaps: n, usd: u, share: usd ? u / usd : 0, swapShare: swaps ? n / swaps : 0 }));
  return {
    from: days[0]?.head.day ?? null, to: days.at(-1)?.head.day ?? null, days: days.length, routes: all.length, swaps, usd, byStatus: by,
    largest: pick([...all], 'usd'),
    largestOneSide: pick(all.filter((x) => x.status === 'one'), 'usd'),
    largestUnpriced: pick(all.filter((x) => x.status === 'none'), 'swaps'),
  };
}
