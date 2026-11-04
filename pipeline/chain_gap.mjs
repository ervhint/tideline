// T1 run 4: where do the swaps the solver census misses settle? The census (chain_spike.mjs) counted only token_diff
// entries with a referral. This run counts, for the same day: transfer-filled swaps (an account sends tokens to a hub and
// gets a different token back), the hubs found from transfers in a random sample, token_diff swaps by referral and size,
// withdrawals, and the event mix of the transactions it reads.
// Keyless public reads only. Writes spike/; it commits, signs and sends nothing.
// Usage: node pipeline/chain_gap.mjs [YYYY-MM-DD]   env SAMPLE (default 2000), GAP_MS (default 1000)
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { chain } from './chain_io.mjs';
import { events, solversOfSwap } from '../analysis/solvers.mjs';
import { diffsOfTx, swapsOfTx, transfersOfTx, withdrawalsOfTx, transferSwaps, usdOf, sampleHashes } from '../analysis/chain_swaps.mjs';
import { bucketOf, BUCKETS } from '../analysis/snapshot.mjs';

const DAY = process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const SAMPLE = Number(process.env.SAMPLE ?? 2000);
const OUT = 'spike';
const MIN_PARTNERS = 3; // a hub sends to and receives from at least this many accounts in the sample

mkdirSync(OUT, { recursive: true });
const result = { run: 'gap', day: DAY, startedAt: new Date().toISOString() };
const save = () => writeFileSync(`${OUT}/result.json`, JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n');
const t0 = Date.now();
const minutes = (from) => Math.round((Date.now() - from) / 600) / 100;
const { stats, listAccount, readTxs, heightAt, priceBook } = chain({ gapMs: Number(process.env.GAP_MS ?? 1000) });
const sum = (xs) => xs.reduce((t, v) => t + v, 0);
const tally = (xs, key, val = () => 1) => { const m = new Map(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + val(x)); return [...m].sort((a, b) => b[1] - a[1]); };
const round = (rows) => rows.map(([k, v]) => [k, Math.round(v)]);
const hash = (x) => x.transaction?.hash;

// 1. The day, its settlement list and a random sample of it.
const dayStart = Date.parse(`${DAY}T00:00:00Z`) / 1000;
const from = await heightAt(dayStart), to = await heightAt(dayStart + 86_400);
const settlement = await listAccount({ account_id: 'intents.near', is_signer: true }, from, to);
const sampleTxs = await readTxs(sampleHashes([...settlement.txs.keys()], SAMPLE, `${DAY}:gap`));
result.sample = { settlement: settlement.txs.size, read: sampleTxs.length, minutes: minutes(t0) };
save();

// 2. Who fills: token_diff solvers, and hubs that both send transfers to and receive them from several accounts.
const diffSolvers = new Set(sampleTxs.flatMap((x) => { const s = swapsOfTx(x); return s.length ? solversOfSwap([x], new Set(s.map((y) => y.intentHash))) : []; }));
const partners = new Map(); // account -> { sent: Set, got: Set }
for (const x of sampleTxs) for (const t of transfersOfTx(x)) {
  (partners.get(t.from) ?? partners.set(t.from, { sent: new Set(), got: new Set() }).get(t.from)).sent.add(t.to);
  (partners.get(t.to) ?? partners.set(t.to, { sent: new Set(), got: new Set() }).get(t.to)).got.add(t.from);
}
const hubs = new Set([...partners].filter(([, p]) => p.sent.size >= MIN_PARTNERS && p.got.size >= MIN_PARTNERS).map(([a]) => a));
const fillers = new Set([...diffSolvers, ...hubs]);
result.fillers = {
  diffSolvers: diffSolvers.size, hubs: [...hubs].map((a) => ({ account: a, sentTo: partners.get(a).sent.size, gotFrom: partners.get(a).got.size, alsoDiffSolver: diffSolvers.has(a) })),
  sampleEvents: tally(sampleTxs.flatMap((x) => [...new Set(events(x).map((e) => e.event))]), (e) => e),
};
save();

// 3. The census: every transaction of the day whose dip4 logs name a filler.
let t = Date.now();
const census = new Map(), perFiller = [];
for (const a of fillers) {
  const l = await listAccount({ account_id: a, is_event_log: true }, from, to);
  perFiller.push({ account: a, transactions: l.txs.size, capped: l.capped });
  for (const [h, x] of l.txs) census.set(h, x);
}
const listMinutes = minutes(t);
t = Date.now();
const censusTxs = await readTxs([...census.keys()]);
result.census = { fillers: fillers.size, perFiller: perFiller.sort((a, b) => b.transactions - a.transactions), transactions: census.size, read: censusTxs.length, listMinutes, readMinutes: minutes(t) };
save();

// 4. Rows per transaction, then prices for every token they move.
const rows = censusTxs.map((x) => ({ hash: hash(x), ts: census.get(hash(x))?.ts, signedByIntents: settlement.txs.has(hash(x)), names: [...new Set(events(x).map((e) => e.event))], diffs: diffsOfTx(x), swaps: swapsOfTx(x), transfers: transfersOfTx(x), withdrawals: withdrawalsOfTx(x) }));
const uses = rows.flatMap((r) => [...r.diffs.flatMap((d) => [...d.give, ...d.get]), ...r.transfers, ...r.withdrawals.filter((w) => w.token)].map((x) => ({ ts: r.ts, token: x.token })));
const { priceAt, dec } = await priceBook(uses);
const usdAt = (ts, side) => usdOf(side, priceAt(ts), dec);

// 5. token_diff swaps by referral and size.
const diffSwaps = rows.flatMap((r) => r.swaps.map((s) => ({ ...s, usd: usdAt(r.ts, s.give) ?? usdAt(r.ts, s.get) })));
const by = (swaps, key) => tally(swaps, key).map(([k, n]) => [k, n, Math.round(sum(swaps.filter((s) => key(s) === k).map((s) => s.usd ?? 0)))]);
const sized = (swaps) => BUCKETS.map((b) => [b, swaps.filter((s) => s.usd != null && bucketOf(s.usd) === b).length, Math.round(sum(swaps.filter((s) => s.usd != null && bucketOf(s.usd) === b).map((s) => s.usd)))]);

// 6. Transfer swaps, attributed to a referral through fee accounts that serve one referral in the token_diff swaps.
const diffUsers = new Set(diffSwaps.map((s) => s.account));
const tSwaps = transferSwaps(rows, fillers, diffUsers).map((s) => ({ ...s, usd: usdAt(s.ts, s.give) ?? usdAt(s.ts, s.get) }));
const feeRef = new Map();
for (const [recipient] of tally(diffSwaps.flatMap((s) => s.appFees.map((f) => f.recipient)), (r) => r)) {
  const refs = tally(diffSwaps.filter((s) => s.appFees.some((f) => f.recipient === recipient)), (s) => s.referral);
  if (refs[0][1] / sum(refs.map((x) => x[1])) >= 0.9) feeRef.set(recipient, refs[0][0]);
}
const feesPaid = new Map(); // user -> fee recipients they paid
for (const r of rows) for (const x of r.transfers) if (!fillers.has(x.to)) (feesPaid.get(x.from) ?? feesPaid.set(x.from, new Set()).get(x.from)).add(x.to);
for (const s of tSwaps) s.referral = [...(feesPaid.get(s.user) ?? [])].map((r) => feeRef.get(r)).find(Boolean) ?? (feesPaid.has(s.user) ? '(fee account not single-referral)' : '(no fee transfer)');

// 7. Withdrawals: what left intents.near in these transactions.
const withdrawals = rows.flatMap((r) => r.withdrawals.map((w) => ({ ...w, usd: w.token ? usdAt(r.ts, [{ token: w.token, raw: w.raw }]) : null })));

const noDiff = rows.filter((r) => !r.diffs.length);
result.measure = {
  tokenDiff: { swaps: diffSwaps.length, usd: Math.round(sum(diffSwaps.map((s) => s.usd ?? 0))), unpriced: diffSwaps.filter((s) => s.usd == null).length, byReferral: by(diffSwaps, (s) => s.referral).slice(0, 25), bySize: sized(diffSwaps) },
  transfer: {
    swaps: tSwaps.length, usd: Math.round(sum(tSwaps.map((s) => s.usd ?? 0))), unpriced: tSwaps.filter((s) => s.usd == null).length,
    multiTx: tSwaps.filter((s) => s.hashes.length > 1).length, bySolver: by(tSwaps, (s) => s.solver).slice(0, 10), byReferral: by(tSwaps, (s) => s.referral).slice(0, 25), bySize: sized(tSwaps),
  },
  withdrawals: { count: withdrawals.length, usd: Math.round(sum(withdrawals.map((w) => w.usd ?? 0))), byEvent: tally(withdrawals, (w) => w.event), unpriced: withdrawals.filter((w) => w.usd == null).length },
  censusEvents: { withDiff: rows.length - noDiff.length, withoutDiff: noDiff.length, notSignedByIntents: rows.filter((r) => !r.signedByIntents).length, namesWithoutDiff: tally(noDiff.flatMap((r) => r.names), (n) => n) },
  transferFlows: round(tally(rows.flatMap((r) => r.transfers), (x) => `${fillers.has(x.from) ? 'filler' : feeRef.has(x.from) ? 'fee' : 'other'}→${fillers.has(x.to) ? 'filler' : feeRef.has(x.to) ? 'fee' : 'other'}`)),
};
writeFileSync(`${OUT}/no_diff_examples.json`, JSON.stringify(censusTxs.filter((x) => !diffsOfTx(x).length && transfersOfTx(x).length).slice(0, 8).map((x) => ({ hash: hash(x), signer: x.transaction?.signer_id, logs: (x.receipts ?? []).flatMap((r) => r.execution_outcome?.outcome?.logs ?? []).filter((l) => l.includes('dip4')) })), null, 1));
result.totalMinutes = minutes(t0);
result.fastnear = { ...stats };
result.finishedAt = new Date().toISOString();
save();

const m = result.measure;
const usdM = (x) => `$${(x / 1e6).toFixed(2)}M`;
const summary = [
  `## Gap check, ${DAY}`,
  `- Fillers: ${diffSolvers.size} token_diff solvers, ${hubs.size} transfer hubs; census ${census.size} transactions (${result.census.listMinutes} + ${result.census.readMinutes} min)`,
  `- token_diff swaps ${m.tokenDiff.swaps}, ${usdM(m.tokenDiff.usd)}; transfer swaps ${m.transfer.swaps}, ${usdM(m.transfer.usd)} (${m.transfer.multiTx} across transactions)`,
  `- Withdrawals ${m.withdrawals.count}, ${usdM(m.withdrawals.usd)}; transactions without token_diff ${m.censusEvents.withoutDiff}`,
  `- Run ${result.totalMinutes} min, FastNEAR calls ${stats.calls}, 429s ${stats.r429}`,
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
