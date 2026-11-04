// E3 solver concentration (PREREG.md section 5). Pure: transactions and saved day samples in, numbers out.
import { concentration } from './readings.mjs';
import { BUCKETS } from './snapshot.mjs';

export const events = (tx) => (tx.receipts ?? []).flatMap((r) => (r.execution_outcome?.outcome?.logs ?? []).flatMap((l) => {
  if (!l.startsWith('EVENT_JSON:')) return [];
  try { const e = JSON.parse(l.slice(11)); return e.standard === 'dip4' ? [e] : []; } catch { return []; }
}));

// The solvers of one swap, from all its intents.near transactions. Two ways a swap is filled:
// 1. token_diff: a solver signs the other side of the user's intent; it is the token_diff account whose intent is not the user's.
// 2. transfers: the user's account sends its token to a counterparty and gets a different token back from that same account.
//    One-way transfers (fees, gas refunds) are not a fill.
export function solversOfSwap(txs, userIntentHashes) {
  const evs = txs.flatMap(events);
  const diff = [...new Set(evs.filter((e) => e.event === 'token_diff').flatMap((e) => e.data ?? []).filter((d) => !userIntentHashes.has(d.intent_hash)).map((d) => d.account_id))];
  if (diff.length) return diff;
  const transfers = evs.filter((x) => x.event === 'transfer').flatMap((e) => e.data ?? []);
  // The user's account: the one that signed the user's intent, else the sender of the first transfer (the deposit going in).
  const user = evs.flatMap((e) => e.data ?? []).find((d) => userIntentHashes.has(d.intent_hash))?.account_id ?? transfers[0]?.account_id;
  const tokens = (from, to) => new Set(transfers.filter((d) => d.account_id === from && d.receiver_id === to).flatMap((d) => Object.keys(d.tokens ?? {})));
  const out = [];
  for (const y of new Set(transfers.filter((d) => d.account_id === user).map((d) => d.receiver_id))) {
    const give = tokens(user, y), back = tokens(y, user);
    if ([...back].some((k) => !give.has(k))) out.push(y);
  }
  return out;
}

// Pools sampled days. Per bucket: solver shares of sampled USD. All sizes: each bucket's shares weighted by that bucket's
// real USD on those days, so a sample of 250 small swaps does not count as much as 250 large ones.
export function solverConcentration(days) {
  const bucket = {}, weight = {};
  for (const b of BUCKETS) {
    const usd = {};
    let sampledUsd = 0, resolvedUsd = 0, sampled = 0;
    for (const d of days) {
      const p = d.perBucket[b];
      sampled += p.sampled; sampledUsd += p.usd;
      for (const [a, v] of Object.entries(p.solvers)) { usd[a] = (usd[a] ?? 0) + v; resolvedUsd += v; }
    }
    weight[b] = days.reduce((t, d) => t + d.totals[b].usd, 0);
    const c = concentration(Object.values(usd));
    const top = Object.entries(usd).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([account, v]) => ({ account, share: v / resolvedUsd }));
    bucket[b] = { sampled, resolvedShare: sampledUsd ? resolvedUsd / sampledUsd : null, solvers: Object.keys(usd).length, hhi: c.hhi, top3: c.top3, top, shares: Object.fromEntries(Object.entries(usd).map(([a, v]) => [a, v / resolvedUsd])) };
  }
  const total = Object.values(weight).reduce((t, v) => t + v, 0);
  const all = {};
  for (const b of BUCKETS) for (const [a, s] of Object.entries(bucket[b].shares)) all[a] = (all[a] ?? 0) + (s * weight[b]) / total;
  const c = concentration(Object.values(all));
  const top = Object.entries(all).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([account, share]) => ({ account, share }));
  for (const b of BUCKETS) delete bucket[b].shares;
  return { days: days.map((d) => d.day), bySize: bucket, allSizes: { hhi: c.hhi, top3: c.top3, top, solvers: Object.keys(all).length } };
}
