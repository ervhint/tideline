// Q4 largest integrator on frozen chain days (T6, PREREG.md section 6 and amendment A1). Pure: parsed day files in, shares out.
// A day is { head, swaps } from parseDayFile in analysis/chain_day.mjs.
import { BUCKETS } from './snapshot.mjs';

// Not one frontend each, so they count in the total but cannot be the largest (A1).
export const NOT_ONE_FRONTEND = new Set(['', '1click-unknown']);

// A1: app fee on the gross input, vol × fee ÷ (10,000 − fee).
export const feePaid = (r) => (r.vol > 0 && r.fee != null ? (r.vol * r.fee) / (1e4 - r.fee) : 0);

// Largest referral's share of fee paid over token_diff rows. Returns null when no fee was paid or no single frontend paid any.
export function largestShare(rows) {
  const by = new Map();
  let total = 0, named = 0;
  for (const r of rows) {
    const f = feePaid(r);
    if (!(f > 0)) continue;
    total += f;
    if (NOT_ONE_FRONTEND.has(r.ref ?? '')) continue;
    named += f;
    by.set(r.ref, (by.get(r.ref) ?? 0) + f);
  }
  if (!(total > 0) || !by.size) return null;
  const [referral, fee] = [...by].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { referral, feeUsd: fee, totalFeeUsd: total, share: fee / total, shareOfNamed: fee / named };
}

// Q4 over the days given (the last 30 frozen days), plus the same rule inside each size bucket and what was left out.
export function integratorShares(days) {
  const all = days.flatMap((d) => d.swaps);
  const d = all.filter((r) => r.k === 'd');
  const usd = all.reduce((t, r) => t + (r.vol || 0), 0), dUsd = d.reduce((t, r) => t + (r.vol || 0), 0);
  const unreadable = d.filter((r) => r.fee == null);
  return {
    days: days.map((x) => x.head.day),
    tokenDiffShareOfUsd: usd ? dUsd / usd : null,
    feeUnreadable: { groups: unreadable.length, swaps: unreadable.reduce((t, r) => t + r.n, 0), usd: unreadable.reduce((t, r) => t + (r.vol || 0), 0) },
    largest: largestShare(d),
    bySize: Object.fromEntries(BUCKETS.map((b) => [b, largestShare(d.filter((r) => r.b === b))])),
  };
}
