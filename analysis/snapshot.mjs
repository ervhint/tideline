// Pure: raw Explorer swaps of one UTC day in, snapshot rows out (grain in AGENTS.md). No wallet addresses are kept.
export const BUCKETS = ['0-1k', '1k-10k', '10k-100k', '100k+'];
export const bucketOf = (usd) => (usd < 1000 ? BUCKETS[0] : usd < 10000 ? BUCKETS[1] : usd < 100000 ? BUCKETS[2] : BUCKETS[3]);

export const HEADER = 'day,referral,fee_bps,bucket,swaps,usd_in,usd_out';

// swaps: array of raw rows { referral, appFees, usdIn, usdOut }. Returns sorted CSV lines (no header).
export function dayRows(day, swaps) {
  const groups = new Map();
  for (const s of swaps) {
    const referral = s.referral ?? '';
    const fee = s.appFees.reduce((t, a) => t + a.fee, 0);
    const bucket = bucketOf(s.usdIn);
    const key = `${day},${referral},${fee},${bucket}`;
    const g = groups.get(key) ?? groups.set(key, { n: 0, i: 0, o: 0 }).get(key);
    g.n++; g.i += s.usdIn; g.o += s.usdOut;
  }
  return [...groups].map(([k, g]) => `${k},${g.n},${g.i.toFixed(2)},${g.o.toFixed(2)}`).sort();
}

export const TOKENS_HEADER = 'day,from,to,swaps,usd_in';

// FR-21 coverage board: swaps and USD per route (token in, token out, as 1Click asset ids). Returns sorted CSV lines (no header).
export function tokenRows(day, swaps) {
  const g = new Map();
  for (const s of swaps) {
    const key = `${s.from ?? ''},${s.to ?? ''}`;
    const x = g.get(key) ?? g.set(key, { n: 0, usd: 0 }).get(key);
    x.n++; x.usd += s.usdIn;
  }
  return [...g].map(([k, x]) => `${day},${k},${x.n},${x.usd.toFixed(2)}`).sort();
}

export const NEAR_FEES_HEADER ='day,bucket,swaps,usd_in,app_fee_usd,near_fee_usd';

// FR-05: per size bucket, the app fees users paid and the part the Explorer lists as paid to NEAR's revenue wallets (data/labels/accounts.json).
export function nearFeeRows(day, swaps, wallets) {
  const w = new Set(wallets), g = new Map();
  for (const s of swaps) {
    const b = bucketOf(s.usdIn);
    const x = g.get(b) ?? g.set(b, { n: 0, usd: 0, fee: 0, near: 0 }).get(b);
    x.n++; x.usd += s.usdIn;
    for (const a of s.appFees) { const f = (s.usdIn * a.fee) / 1e4; x.fee += f; if (w.has(a.recipient)) x.near += f; }
  }
  return BUCKETS.filter((b) => g.has(b)).map((b) => { const x = g.get(b); return `${day},${b},${x.n},${x.usd.toFixed(2)},${x.fee.toFixed(2)},${x.near.toFixed(2)}`; });
}
