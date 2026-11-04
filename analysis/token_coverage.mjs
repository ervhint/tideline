// FR-21 coverage board: how much 1Click volume runs on the routes our quote archive samples, and which big routes it misses.
// Pure: route rows (data/snapshot/tokens) and token names (data/labels/tokens.json) in, the board out.

// The routes a quote sampler would ask for (none runs here, see AGENTS.md): BTC, ETH, SOL and NEAR on their own chains, into USDC on Ethereum.
export const QUOTED_ROUTES = [
  '1cs_v1:btc:native:coin', 'nep141:eth.omft.near', 'nep141:sol.omft.near', 'nep141:wrap.near',
].map((from) => `${from}>nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near`);

const QUOTED_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'wNEAR']);

// 'quoted': the exact route we sample. 'similar': the same tokens on other chains (e.g. ETH on Arbitrum into USDC on Base),
// so the fee should be close but is not measured. 'not quoted': everything else.
// Symbols are compared without a bracketed suffix: 1Click lists native bitcoin under its current id as "BTC(OMNI)"
// (1cs_v1:btc:native:coin), the id executed BTC swaps use; the older nep141:btc.omft.near is listed as "BTC".
const base = (s) => s?.replace(/\(.*\)$/, '');

export function routeStatus(from, to, names) {
  if (QUOTED_ROUTES.includes(`${from}>${to}`)) return 'quoted';
  const a = base(names[from]?.symbol), b = base(names[to]?.symbol);
  return QUOTED_SYMBOLS.has(a) && b === 'USDC' ? 'similar' : 'not quoted';
}

const label = (id, names) => (names[id] ? `${names[id].symbol} (${names[id].chain})` : id || 'unknown');

// rows: [{ day, from, to, swaps, usd }]. Returns totals per status and the largest routes overall and among those not quoted.
export function coverageBoard(rows, names, { top = 10 } = {}) {
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const routes = new Map();
  for (const r of rows) {
    const k = `${r.from}>${r.to}`;
    const x = routes.get(k) ?? routes.set(k, { from: r.from, to: r.to, swaps: 0, usd: 0 }).get(k);
    x.swaps += r.swaps; x.usd += r.usd;
  }
  const all = [...routes.values()].map((x) => ({ ...x, route: `${label(x.from, names)} to ${label(x.to, names)}`, status: routeStatus(x.from, x.to, names) }));
  const usd = all.reduce((s, x) => s + x.usd, 0), swaps = all.reduce((s, x) => s + x.swaps, 0);
  const byStatus = Object.fromEntries(['quoted', 'similar', 'not quoted'].map((st) => {
    const xs = all.filter((x) => x.status === st);
    const u = xs.reduce((s, x) => s + x.usd, 0);
    return [st, { routes: xs.length, swaps: xs.reduce((s, x) => s + x.swaps, 0), usd: u, share: usd ? u / usd : 0 }];
  }));
  const pick = (xs) => xs.sort((a, b) => b.usd - a.usd).slice(0, top).map(({ route, status, swaps: n, usd: u }) => ({ route, status, swaps: n, usd: u, share: usd ? u / usd : 0 }));
  return {
    from: days[0] ?? null, to: days.at(-1) ?? null, days: days.length, routes: all.length, swaps, usd, byStatus,
    largest: pick([...all]),
    largestNotQuoted: pick(all.filter((x) => x.status === 'not quoted')),
  };
}
