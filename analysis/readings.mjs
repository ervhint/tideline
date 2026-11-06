// The five readings and the verdict, exactly as PREREG.md section 6 and amendment A2 define them. Pure: numbers in, sides out.
// Each reading returns { side, detail }. Exactly on a line is Neutral; missing data is Not Measured, never a guess.
const B = 'Bullish', N = 'Neutral', R = 'Bearish', M = 'Not Measured';
const pct = (x) => `${(x * 100).toFixed(0)}%`;

// A2 rule 3: over this treasury share of its window, Q3 or Q4 reads Not Measured. Exactly 50% is not over.
export const PRIVATE_LINE = 0.5;
const wentPrivate = (share) => share != null && share > PRIVATE_LINE;
// One decimal when whole percents would hide which side of the line the share is on.
const shareText = (x) => (pct(x) === pct(PRIVATE_LINE) ? `${(x * 100).toFixed(1)}%` : pct(x));
const privateFlow = (treasuryShare, sideFigures) => ({ side: M, detail: `Flow went private: treasury ${shareText(treasuryShare)} of USD`, privateFlow: true, treasuryShare, sideFigures });

// Q1: the E1 interval against the -1 line. usable: how many fee changes were usable once the census has run (null before it has).
export function q1(e1, usable = null) {
  if (!e1) return { side: M, detail: usable == null ? 'Still to estimate' : `${usable} usable fee change${usable === 1 ? '' : 's'}, 3 needed` };
  const side = e1.lo > -1 ? B : e1.hi < -1 ? R : N;
  return { side, detail: `Elasticity ${e1.estimate?.toFixed(2) ?? ''} (${e1.lo.toFixed(2)} to ${e1.hi.toFixed(2)}), token_diff swaps only`.replace('  ', ' ') };
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

// Q3: spread (bps, what the solver keeps) and top-3 solver share (0 to 1), both on public swaps; treasuryShare of the same 7 days (A2).
// Over the private line both are kept as side figures and set nothing (A2 rule 4).
export function q3({ spreadBps, top3, treasuryShare = null }) {
  if (wentPrivate(treasuryShare)) return privateFlow(treasuryShare, { spreadBps: spreadBps ?? null, top3: top3 ?? null });
  if (spreadBps == null || top3 == null) {
    return { side: M, detail: top3 == null ? 'Top 3 share not available' : 'No spread data' };
  }
  const side = spreadBps > 10 || top3 > 0.8 ? R : spreadBps < 5 && top3 < 0.6 ? B : N;
  return { side, detail: `Spread ${spreadBps.toFixed(1)} bps, top 3 hold ${pct(top3)}` };
}

// Q4: largest integrator's share of 30-day fees (0 to 1); treasuryShare of the same 30 days (A2).
export function q4(share, name, treasuryShare = null) {
  if (wentPrivate(treasuryShare)) return privateFlow(treasuryShare, { share: share ?? null, name: name ?? null });
  if (share == null) return { side: M, detail: 'Not available' };
  const side = share < 0.5 ? B : share > 0.8 ? R : N;
  return { side, detail: `${name ? name + ' ' : ''}${pct(share)} of visible app fees`.trim() };
}

// Q5: trailing 90-day revenue at four month-ends, oldest first.
export function q5(rates) {
  if (!rates || rates.length < 4) return { side: M, detail: 'Fewer than 4 month-ends of data' };
  const steps = rates.slice(1).map((r, i) => r - rates[i]);
  const side = steps.every((s) => s > 0) ? B : steps.every((s) => s < 0) ? R : N;
  return { side, detail: `90-day revenue ${side === B ? 'rose' : side === R ? 'fell' : 'did not move one way'} over the last 3 months` };
}

// Verdict: Bullish +1, Bearish -1, Q1 and Q5 count double. 3 or more Not Measured is Undecided; otherwise +3 or more / -3 or less.
// held: ids of the readings Not Measured under A2 rule 3. While any is held the verdict is Undecided whatever the score, so a loss of data can't move it (rule 5).
export function verdict(sides, held = []) {
  const w = [2, 1, 1, 1, 2];
  const score = sides.reduce((s, x, i) => s + (x === B ? w[i] : x === R ? -w[i] : 0), 0);
  const missing = sides.filter((x) => x === M).length;
  const v = held.length || missing >= 3 ? 'Undecided' : score >= 3 ? B : score <= -3 ? R : 'Undecided';
  return { verdict: v, score, missing, held };
}

// Concentration of a list of volumes: HHI on a 0 to 10,000 scale and the top-3 share (0 to 1).
export function concentration(values) {
  const total = values.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return { hhi: null, top3: null };
  const shares = values.map((v) => v / total).sort((a, b) => b - a);
  return { hhi: shares.reduce((s, x) => s + (x * 100) ** 2, 0), top3: shares.slice(0, 3).reduce((s, x) => s + x, 0) };
}

// Q4 largest integrator on chain days: analysis/integrator.mjs (PREREG.md amendment A1).

// Trailing 90-day revenue at the last day and 30, 60 and 90 days earlier, oldest first. series: [{ day, revenue }] oldest first, one per day.
export function runRates(series) {
  if (!series || series.length < 180) return null;
  const sum = (end) => series.slice(end - 89, end + 1).reduce((s, d) => s + d.revenue, 0);
  const last = series.length - 1;
  return [last - 90, last - 60, last - 30, last].map(sum);
}

// The Q3 spread comes from realised chain swaps: q3Spread in analysis/realised_cost.mjs (PREREG.md section 8).
