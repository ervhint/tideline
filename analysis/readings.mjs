// The five readings and the verdict, exactly as PREREG.md section 6 defines them. Pure: numbers in, sides out.
// Each reading returns { side, detail }. Exactly on a line is Neutral; missing data is Not Measured, never a guess.
const B = 'Bullish', N = 'Neutral', R = 'Bearish', M = 'Not Measured';
const pct = (x) => `${(x * 100).toFixed(0)}%`;

// Q1: the E1 interval against the -1 line.
export function q1(e1) {
  if (!e1) return { side: M, detail: 'Still to estimate' };
  const side = e1.lo > -1 ? B : e1.hi < -1 ? R : N;
  return { side, detail: `Elasticity ${e1.estimate?.toFixed(2) ?? ''} (${e1.lo.toFixed(2)} to ${e1.hi.toFixed(2)}), 1Click only`.replace('  ', ' ') };
}

// Q2: days = [{ fees, revenue }] oldest first, daily DefiLlama values. 30-day capture and the last 14 days.
export function q2(days) {
  if (!days || days.length < 30) return { side: M, detail: 'Fewer than 30 days of data' };
  const last = days.slice(-30);
  const fees = last.reduce((s, d) => s + d.fees, 0);
  if (!(fees > 0)) return { side: M, detail: 'No fees in the last 30 days' };
  const capture = last.reduce((s, d) => s + d.revenue, 0) / fees;
  const lowAll14 = last.slice(-14).every((d) => d.fees > 0 && d.revenue / d.fees < 0.2);
  const side = capture > 0.3 ? B : lowAll14 ? R : N;
  return { side, capture, detail: `${pct(capture)} last 30 days` };
}

// Q3: spread (bps, what the solver keeps) and top-3 solver share (0 to 1).
export function q3({ spreadBps, top3 }) {
  if (spreadBps == null || top3 == null) {
    return { side: M, detail: top3 == null ? 'Top 3 share not available' : 'No spread data' };
  }
  const side = spreadBps > 10 || top3 > 0.8 ? R : spreadBps < 5 && top3 < 0.6 ? B : N;
  return { side, detail: `Spread ${spreadBps.toFixed(1)} bps, top 3 hold ${pct(top3)}` };
}

// Q4: largest integrator's share of 30-day fees (0 to 1).
export function q4(share, name) {
  if (share == null) return { side: M, detail: 'Not available' };
  const side = share < 0.5 ? B : share > 0.8 ? R : N;
  return { side, detail: `${name ? name + ' ' : ''}${pct(share)} of fees, 1Click only`.trim() };
}

// Q5: trailing 90-day revenue at four month-ends, oldest first.
export function q5(rates) {
  if (!rates || rates.length < 4) return { side: M, detail: 'Fewer than 4 month-ends of data' };
  const steps = rates.slice(1).map((r, i) => r - rates[i]);
  const side = steps.every((s) => s > 0) ? B : steps.every((s) => s < 0) ? R : N;
  return { side, detail: `90-day revenue ${side === B ? 'rose' : side === R ? 'fell' : 'did not move one way'} over the last 3 months` };
}

// Verdict: Bullish +1, Bearish -1, Q1 and Q5 count double. 3 or more Not Measured is Undecided; otherwise +3 or more / -3 or less.
export function verdict(sides) {
  const w = [2, 1, 1, 1, 2];
  const score = sides.reduce((s, x, i) => s + (x === B ? w[i] : x === R ? -w[i] : 0), 0);
  const missing = sides.filter((x) => x === M).length;
  const v = missing >= 3 ? 'Undecided' : score >= 3 ? B : score <= -3 ? R : 'Undecided';
  return { verdict: v, score, missing };
}

// Concentration of a list of volumes: HHI on a 0 to 10,000 scale and the top-3 share (0 to 1).
export function concentration(values) {
  const total = values.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return { hhi: null, top3: null };
  const shares = values.map((v) => v / total).sort((a, b) => b - a);
  return { hhi: shares.reduce((s, x) => s + (x * 100) ** 2, 0), top3: shares.slice(0, 3).reduce((s, x) => s + x, 0) };
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Largest frontend's share of fees (usd in x fee rate) over the `days` days ending on `lastDay`. Blank referral is not an integrator,
// but its fees stay in the total. rows: { day, referral, fee_bps, usd_in }.
export function largestIntegrator(rows, lastDay, days) {
  const from = addDays(lastDay, -(days - 1));
  const by = new Map();
  let total = 0;
  for (const r of rows) {
    if (r.day < from || r.day > lastDay) continue;
    const fee = (r.usd_in * r.fee_bps) / 1e4;
    total += fee;
    if (r.referral) by.set(r.referral, (by.get(r.referral) ?? 0) + fee);
  }
  if (!(total > 0) || !by.size) return null;
  const [referral, fee] = [...by].sort((a, b) => b[1] - a[1])[0];
  return { referral, share: fee / total };
}

// The same share, once per size bucket (S6). rows also carry `bucket`; a bucket with no fees gives null.
export function largestIntegratorBySize(rows, lastDay, days, buckets) {
  return Object.fromEntries(buckets.map((b) => [b, largestIntegrator(rows.filter((r) => r.bucket === b), lastDay, days)]));
}

// Trailing 90-day revenue at the last day and 30, 60 and 90 days earlier, oldest first. series: [{ day, revenue }] oldest first, one per day.
export function runRates(series) {
  if (!series || series.length < 180) return null;
  const sum = (end) => series.slice(end - 89, end + 1).reduce((s, d) => s + d.revenue, 0);
  const last = series.length - 1;
  return [last - 90, last - 60, last - 30, last].map(sum);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Median of what the solver keeps (all-in minus app fee and withdraw fee, from fee_trace's traceQuote) on $1,000 quotes in the 7 days to `asOf`.
// The protocol fee is not visible in a quote, so it stays inside this number (PREREG section 8).
export function spreadBps(quotes, asOf) {
  const from = Date.parse(asOf) - 7 * 86_400_000;
  const xs = quotes.filter((q) => q.sizeUsd === 1000 && Date.parse(q.sampledAt) > from && Date.parse(q.sampledAt) <= Date.parse(asOf)).map((q) => q.unexplainedBps);
  return xs.length ? median(xs) : null;
}
