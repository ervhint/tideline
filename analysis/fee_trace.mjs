// Splits the all-in cost of an archived 1Click dry quote into parts (FR-05, AC-3.1). Pure: archive rows in, numbers out.
// All-in cost = how much less USDC comes out than the Binance mid says the input is worth, in bps.
// App fee and withdraw fee are read from the quote itself; the protocol fee comes from intents.near fee() (data/snapshot/protocol_fee.json).
// Whatever is left is "unexplained": mostly the solver spread, plus price movement between the Binance mid and the quote.
const USDC_DECIMALS = 6;

export function traceQuote(row, protocolBps = 0) {
  const q = row?.response?.quote;
  const ref = row?.reference;
  if (!q || !ref || row.http >= 400) return null;
  const fair = (Number(q.amountInFormatted) * ref.mid) / ref.usdcUsdtMid; // USDC the input is worth at the outside price
  const out = Number(q.amountOutFormatted);
  if (!(fair > 0) || !(out > 0)) return null;
  const allInBps = (1 - out / fair) * 1e4;
  const appFeeBps = (row.response.quoteRequest?.appFees ?? []).reduce((s, f) => s + f.fee, 0);
  const withdrawBps = ((Number(q.withdrawFee) / 10 ** USDC_DECIMALS) / fair) * 1e4;
  return { pair: row.pair, sizeUsd: row.sizeUsd, sampledAt: row.sampledAt, allInBps, appFeeBps, withdrawBps, protocolBps, unexplainedBps: allInBps - appFeeBps - withdrawBps - protocolBps };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Groups by pair and size. A failed quote counts in `failed` and is never dropped silently.
export function traceArchive(rows, protocolBps = 0) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.pair}|${row.sizeUsd}`;
    const g = groups.get(key) ?? { pair: row.pair, sizeUsd: row.sizeUsd, traces: [], failed: 0 };
    const t = traceQuote(row, protocolBps);
    if (t) g.traces.push(t); else g.failed++;
    groups.set(key, g);
  }
  return [...groups.values()].map(({ pair, sizeUsd, traces, failed }) => {
    if (!traces.length) return { pair, sizeUsd, n: 0, failed };
    const col = (k) => traces.map((t) => t[k]);
    const allIn = col('allInBps');
    return {
      pair, sizeUsd, n: traces.length, failed,
      allInBps: median(allIn), allInMinBps: Math.min(...allIn), allInMaxBps: Math.max(...allIn),
      appFeeBps: median(col('appFeeBps')), withdrawBps: median(col('withdrawBps')), protocolBps, unexplainedBps: median(col('unexplainedBps')),
      from: traces.map((t) => t.sampledAt).sort()[0], to: traces.map((t) => t.sampledAt).sort().at(-1),
    };
  });
}

// AC-3.1: parts must add up to the all-in cost within 0.5 bps; the remainder is reported, never hidden.
export function partsGapBps(g) {
  return g.allInBps - (g.appFeeBps + g.withdrawBps + (g.protocolBps ?? 0) + g.unexplainedBps);
}

// Where the app fees of executed 1Click swaps went, per size bucket, over the last `days` days of data/snapshot/near_fees.
// rows: { day, bucket, usd_in, app_fee_usd, near_fee_usd }. NEAR's part is what was paid straight to its revenue wallets.
export function nearShare(rows, lastDay, days = 30) {
  const from = new Date(Date.parse(`${lastDay}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const out = {};
  for (const r of rows) {
    if (r.day < from || r.day > lastDay) continue;
    const x = (out[r.bucket] ??= { usd: 0, appFeeUsd: 0, nearFeeUsd: 0 });
    x.usd += r.usd_in; x.appFeeUsd += r.app_fee_usd; x.nearFeeUsd += r.near_fee_usd;
  }
  for (const x of Object.values(out)) { x.appFeeBps = (1e4 * x.appFeeUsd) / x.usd; x.nearBps = (1e4 * x.nearFeeUsd) / x.usd; x.nearShareOfAppFees = x.nearFeeUsd / x.appFeeUsd; }
  return { from, to: lastDay, days, buckets: out };
}
