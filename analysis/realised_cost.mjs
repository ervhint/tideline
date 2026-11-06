// Realised cost and solver concentration from frozen chain days (T4). Pure: parsed day files in, numbers out. No network.
// Follows PREREG.md section 5 (E3), section 7 (cost parts), section 8 (Q3 spread) and amendment A2 (the treasury is not a solver, rules 2 and 6).
// A day is { head, swaps } from parseDayFile in analysis/chain_day.mjs.
import { concentration } from './readings.mjs';
import { BUCKETS } from './snapshot.mjs';
import { isTreasury } from './treasury.mjs';

export const PRICE_BAND = [0.8, 1.25]; // PREREG 7: USD out ÷ USD in outside this is a likely price error
export const MIN_DAY_SWAPS = 30; // PREREG 8: a day with fewer priced swaps in the bucket is skipped
export const MIN_DAYS = 5; // PREREG 8: fewer usable days is Not Measured
export const Q3_BUCKET = '1k-10k';

const r2 = (x) => Math.round(x * 100) / 100;
const empty = () => ({ groups: 0, swaps: 0, usd: 0 });
const add = (c, g, usd) => { c.groups++; c.swaps += g.np; c.usd += usd; };

// PREREG 7 over a list of swap rows. protocolFeeBps: the intents.near fee() rate (0.01 bps).
export function costParts(rows, protocolFeeBps) {
  // notBothPriced: swaps without a price on both sides (their USD is not known on both sides, so only the count is kept).
  const left = { notBothPriced: { swaps: 0 }, feeUnreadable: empty(), priceCheck: empty() };
  let gross = 0, inUsd = 0, out = 0, grossDiff = 0, swaps = 0, groups = 0;
  for (const g of rows) {
    left.notBothPriced.swaps += g.n - g.np;
    if (!g.np) continue;
    const fee = g.k === 't' ? 0 : g.fee;
    if (fee == null) { add(left.feeUnreadable, g, g.in); continue; }
    const ratio = g.in > 0 ? g.out / g.in : null;
    if (ratio == null || ratio < PRICE_BAND[0] || ratio > PRICE_BAND[1]) { add(left.priceCheck, g, g.in); continue; }
    const gi = g.in / (1 - fee / 1e4);
    gross += gi; inUsd += g.in; out += g.out; swaps += g.np; groups++;
    if (g.k === 'd') grossDiff += gi;
  }
  left.feeUnreadable.usd = r2(left.feeUnreadable.usd); left.priceCheck.usd = r2(left.priceCheck.usd);
  if (!(gross > 0)) return { groups, swaps, grossUsd: 0, outUsd: 0, allInBps: null, appFeeBps: null, protocolBps: null, spreadBps: null, partsGapBps: null, left };
  const allInBps = ((gross - out) / gross) * 1e4;
  const appFeeBps = ((gross - inUsd) / gross) * 1e4;
  const protocolBps = protocolFeeBps * (grossDiff / gross);
  const spreadBps = allInBps - appFeeBps - protocolBps;
  // INV-4: the parts, each rounded as published (2 decimals), must add up to the rounded all-in within 0.5 bps.
  const partsGapBps = r2(r2(allInBps) - (r2(appFeeBps) + r2(protocolBps) + r2(spreadBps)));
  return { groups, swaps, grossUsd: r2(gross), outUsd: r2(out), allInBps, appFeeBps, protocolBps, spreadBps, partsGapBps, left };
}

const rowsOf = (days, pick = () => true) => days.flatMap((d) => d.swaps.filter(pick));
const isPublic = (r) => !isTreasury(r);

// A2 rule 6: the confidential path, all-in cost only. Any fee on it is hidden on FAR, so it has no app fee, protocol fee or spread field, not even a 0.
export function confidentialPath(rows) {
  const { groups, swaps, grossUsd, outUsd, allInBps, left } = costParts(rows, 0);
  return { groups, swaps, inUsd: grossUsd, outUsd, allInBps, left };
}

// Follow the fee (PREREG 7, A2 rule 6): the cost split per size bucket and for all sizes, on public swaps and per kind, with treasury groups on their own line.
export function feeTrace(days, protocolFeeBps) {
  const kinds = { all: () => true, tokenDiff: (r) => r.k === 'd', transfer: (r) => r.k === 't' };
  const of = (pick) => ({
    ...Object.fromEntries(Object.entries(kinds).map(([k, f]) => [k, costParts(rowsOf(days, (r) => isPublic(r) && pick(r) && f(r)), protocolFeeBps)])),
    confidential: confidentialPath(rowsOf(days, (r) => isTreasury(r) && pick(r))),
  });
  return {
    days: days.map((d) => d.head.day),
    bySize: Object.fromEntries(BUCKETS.map((b) => [b, of((r) => r.b === b)])),
    allSizes: of((r) => r.b !== 'unpriced'),
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Q3 spread (PREREG 8, A2 rule 2): median of the daily spreads in the $1k–10k bucket over the days given (the last 7), treasury groups left out.
export function q3Spread(days, protocolFeeBps) {
  const perDay = days.map((d) => {
    const c = costParts(d.swaps.filter((r) => r.b === Q3_BUCKET && isPublic(r)), protocolFeeBps);
    const usable = c.swaps >= MIN_DAY_SWAPS && c.spreadBps != null;
    return { day: d.head.day, swaps: c.swaps, spreadBps: c.spreadBps, allInBps: c.allInBps, appFeeBps: c.appFeeBps, usable };
  });
  const used = perDay.filter((d) => d.usable);
  return { bucket: Q3_BUCKET, perDay, usableDays: used.length, spreadBps: used.length >= MIN_DAYS ? median(used.map((d) => d.spreadBps)) : null };
}

// USD per filler account (PREREG 5). A solver field 'a+b' splits its USD equally. Unpriced swaps carry no USD.
export function fillerUsd(rows) {
  const usd = new Map();
  for (const r of rows) {
    if (r.b === 'unpriced' || !r.solver || !(r.vol > 0)) continue;
    const names = r.solver.split('+');
    for (const a of names) usd.set(a, (usd.get(a) ?? 0) + r.vol / names.length);
  }
  return usd;
}

function shareOf(usd) {
  const total = [...usd.values()].reduce((t, v) => t + v, 0);
  const c = concentration([...usd.values()]);
  const top = [...usd].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([account, v]) => ({ account, share: v / total }));
  return { usd: r2(total), solvers: usd.size, hhi: c.hhi, top3: c.top3, top };
}

// E3 over the days given (PREREG 5, A2 rule 2): per bucket and all sizes, treasury groups left out, with the token_diff-only side figure and how much one day moves it.
export function solverConcentrationChain(days) {
  const rows = rowsOf(days, isPublic);
  const bySize = Object.fromEntries(BUCKETS.map((b) => {
    const rs = rows.filter((r) => r.b === b);
    return [b, { ...shareOf(fillerUsd(rs)), sampled: rs.reduce((t, r) => t + r.n, 0) }];
  }));
  const top3 = (ds) => shareOf(fillerUsd(rowsOf(ds, isPublic))).top3;
  return {
    days: days.map((d) => d.head.day),
    bySize,
    allSizes: shareOf(fillerUsd(rows)),
    tokenDiffOnly: shareOf(fillerUsd(rows.filter((r) => r.k === 'd'))),
    stability: days.length > 1 && {
      perDayTop3: days.map((d) => ({ day: d.head.day, top3: top3([d]) })),
      leaveOneDayOut: (() => { const v = days.map((_, i) => top3(days.filter((_, j) => j !== i))); return { min: Math.min(...v), max: Math.max(...v) }; })(),
    },
  };
}
