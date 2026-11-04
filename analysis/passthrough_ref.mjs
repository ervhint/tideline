// FR-08: E2 pass-through priced against Binance, not the Explorer's own USD values (PREREG.md section 4, "Limit").
// Pure: the saved window totals in, numbers out. The interval resamples events with a fixed seed, because placebo dates would need
// every day of each frontend's history priced by the minute, which this check does not pull.
export const MIN_PRICED = 20; // priced swaps needed in each window
export const BOOT = 10000;
export const BOOT_SEED = 20261103;

// One window: { priced, refIn, refOut, expIn, expOut } summed over the swaps where both tokens had a Binance price.
export const costBps = (w, ref = true) => (ref ? 1e4 * (1 - w.refOut / w.refIn) : 1e4 * (1 - w.expOut / w.expIn));

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slope = (x, y) => { let a = 0, b = 0; for (let i = 0; i < x.length; i++) { a += x[i] * y[i]; b += x[i] * x[i]; } return a / b; };

export function passThroughRef(events, { boot = BOOT, seed = BOOT_SEED } = {}) {
  const used = [], dropped = [];
  for (const e of events) {
    const { before: b, after: a } = e.windows;
    const base = { frontend: e.frontend, firstDayAfter: e.firstDayAfter, from: e.from, to: e.to };
    if (b.priced < MIN_PRICED || a.priced < MIN_PRICED) { dropped.push({ ...base, reason: `under ${MIN_PRICED} priced swaps in a window (${b.priced} before, ${a.priced} after)` }); continue; }
    used.push({ ...base, dfee: e.to - e.from, dRef: costBps(a) - costBps(b), dExplorer: costBps(a, false) - costBps(b, false), pricedShare: (a.priced + b.priced) / (a.swaps + b.swaps) });
  }
  if (used.length < 2) return { usable: used.length, events: used, dropped, estimate: null, explorerSameSwaps: null };
  const x = used.map((u) => u.dfee), y = used.map((u) => u.dRef);
  const rng = mulberry32(seed), draws = new Float64Array(boot), xi = new Array(x.length), yi = new Array(x.length);
  for (let r = 0; r < boot; r++) {
    for (let i = 0; i < x.length; i++) { const k = Math.floor(rng() * x.length); xi[i] = x[k]; yi[i] = y[k]; }
    draws[r] = slope(xi, yi);
  }
  draws.sort();
  const lo = draws[Math.floor(0.025 * boot)], hi = draws[Math.ceil(0.975 * boot) - 1];
  return {
    usable: used.length, events: used, dropped,
    estimate: slope(x, y), lo, hi, boot, seed,
    underpowered: lo <= 0 && hi >= 0, // PREREG.md: underpowered when the interval spans zero
    explorerSameSwaps: slope(x, used.map((u) => u.dExplorer)),
  };
}
