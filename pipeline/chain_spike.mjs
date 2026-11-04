// T1 spike (docs/PLAN.md §6): one UTC day of intents.near settlement from FastNEAR, priced from DefiLlama.
// Run 1 (4 Nov) sampled 4,000 of the day's settlement transactions: fast enough, but a 4% sample of heavy-tailed swaps
// gave a volume interval of ±95%. Run 2 adds a census: every transaction whose dip4 logs name one of the solvers seen in
// the sample, which is every swap those solvers filled. It also checks swaps in transactions intents.near did not sign,
// and the fee-account route (PLAN §5) on fee accounts that serve a single referral.
// Keyless public reads only. Writes spike/; it commits, signs and sends nothing.
// Usage: node pipeline/chain_spike.mjs [YYYY-MM-DD]   env SAMPLE (default 2000), GAP_MS (default 1000), FEE_WEEKS (default 26)
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { getJson } from './http.mjs';
import { chain } from './chain_io.mjs';
import { diffsOfTx, swapsOfTx, feeBps, llamaId, usdOf, sideAgreement, sampleHashes, extrapolate } from '../analysis/chain_swaps.mjs';
import { solversOfSwap } from '../analysis/solvers.mjs';

const DAY = process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const SAMPLE = Number(process.env.SAMPLE ?? 2000);
const GAP_MS = Number(process.env.GAP_MS ?? 1000);
const FEE_WEEKS = Number(process.env.FEE_WEEKS ?? 26);
const OUT = 'spike';
const MAX_PAGES = 1500; // about 300,000 transactions: a cap in case a filter is ignored
const MIN_CHANGE_BPS = 5; // analysis/prereg_events.mjs

mkdirSync(OUT, { recursive: true });
const result = { day: DAY, startedAt: new Date().toISOString(), settings: { SAMPLE, GAP_MS, FEE_WEEKS } };
const save = () => writeFileSync(`${OUT}/result.json`, JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n');
const t0 = Date.now();
const minutes = (from) => Math.round((Date.now() - from) / 600) / 100;

const { stats: fastStats, fast, listAccount, readTxs, heightAt, priceBook } = chain({ gapMs: GAP_MS, maxPages: MAX_PAGES });

const sum = (xs) => xs.reduce((t, v) => t + v, 0);
const tally = (xs, key, val = () => 1) => { const m = new Map(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + val(x)); return [...m].sort((a, b) => b[1] - a[1]); };
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mode = (xs) => tally(xs.filter((x) => x != null), (x) => x)[0]?.[0] ?? null;
const share = (part, all) => (all ? Math.round((part / all) * 1000) / 1000 : null);

// The fee-account route (PLAN §5): the fee rate one fee account was paid, week by week, from 20 of its transactions per week.
// Fee rates only, no volume: the event list must be found before any volume is read. Above 1,000 bps is not read as a fee.
async function feeRoute(accounts) {
  const back = FEE_WEEKS * 7 * 86_400;
  const fromHeight = await heightAt(dayStart - back);
  const heightOf = (ts) => Math.round(fromHeight + ((from - fromHeight) * (ts - (dayStart - back))) / back);
  const out = [];
  for (const a of accounts) {
    const weeks = [];
    for (let w = 0; w < FEE_WEEKS; w++) {
      const end = dayStart - w * 7 * 86_400;
      const r = await fast('/v0/account', { account_id: a.recipient, is_event_log: true, to_tx_block_height: heightOf(end), limit: 200, desc: true });
      const hashes = (r.account_txs ?? []).map((x) => x.transaction_hash);
      if (!hashes.length) { weeks.push({ weekEnding: new Date(end * 1000).toISOString().slice(0, 10), listed: 0 }); break; }
      const got = await readTxs(sampleHashes(hashes, 20, `${DAY}:${a.recipient}:${w}`));
      const bps = got.flatMap(swapsOfTx).map((s) => feeBps(s, a.recipient)).filter((x) => x != null && x <= 1000);
      const lastTs = Number(BigInt(r.account_txs[0].tx_block_timestamp) / 1_000_000_000n);
      weeks.push({ weekEnding: new Date(end * 1000).toISOString().slice(0, 10), lastTxDay: new Date(lastTs * 1000).toISOString().slice(0, 10), feeSwaps: bps.length, modeBps: mode(bps), modeShare: share(bps.filter((x) => x === mode(bps)).length, bps.length), referrals: tally(got.flatMap(swapsOfTx).filter((s) => s.appFees.some((f) => f.recipient === a.recipient)), (s) => s.referral).slice(0, 2) });
    }
    const known = weeks.filter((w) => w.modeBps != null).reverse(); // oldest first
    const steps = [];
    for (let i = 1; i < known.length; i++) if (Math.abs(known[i].modeBps - known[i - 1].modeBps) >= MIN_CHANGE_BPS) steps.push({ after: known[i - 1].weekEnding, by: known[i].weekEnding, from: known[i - 1].modeBps, to: known[i].modeBps });
    out.push({ ...a, weeks, steps });
    result.feeRoute = out;
    save();
  }
  return out;
}

// 1. The day's block range and the full list of settlement transactions (signed by intents.near).
const dayStart = Date.parse(`${DAY}T00:00:00Z`) / 1000;
const from = await heightAt(dayStart), to = await heightAt(dayStart + 86_400);
result.blocks = { from, toExclusive: to };
// FEE_ACCOUNTS (comma-separated) runs the fee-account route alone on those accounts.
if (process.env.FEE_ACCOUNTS) {
  const t1 = Date.now();
  await feeRoute(process.env.FEE_ACCOUNTS.split(',').map((recipient) => ({ recipient })));
  Object.assign(result, { feeRouteMinutes: minutes(t1), fastnear: fastStats, finishedAt: new Date().toISOString() });
  save();
  console.log(result.feeRoute.map((f) => `${f.recipient}: ${f.steps.length} steps ${JSON.stringify(f.steps)}`).join('\n'));
  process.exit(0);
}
let t = Date.now();
const settlement = await listAccount({ account_id: 'intents.near', is_signer: true }, from, to);
const N = settlement.txs.size;
result.listing = { transactions: N, pages: settlement.pages, capped: settlement.capped, minutes: minutes(t) };
save();
if (!N) throw new Error('the listing found no transactions');

// 2. The seeded sample. Its first half picks the solvers; its second half tests how many swaps those solvers cover.
const sample = sampleHashes([...settlement.txs.keys()], SAMPLE, DAY);
writeFileSync(`${OUT}/sample_hashes.txt`, sample.join('\n') + '\n');
t = Date.now();
const sampleTxs = await readTxs(sample);
result.reading = { sampled: sample.length, read: sampleTxs.length, minutes: minutes(t) };
save();
const rank = new Map(sample.map((h, i) => [h, i]));
const solversIn = (tx) => { const s = swapsOfTx(tx); return s.length ? solversOfSwap([tx], new Set(s.map((x) => x.intentHash))) : []; };
const trainSolvers = new Set(sampleTxs.filter((x) => rank.get(x.transaction?.hash) < SAMPLE / 2).flatMap(solversIn));
const allSolvers = new Set(sampleTxs.flatMap(solversIn));

// 3. Swaps in transactions intents.near did not sign: the first hour of the day, every transaction sent to intents.near.
t = Date.now();
const hourEnd = await heightAt(dayStart + 3600);
const received = await listAccount({ account_id: 'intents.near', is_receiver: true }, from, hourEnd);
const others = [...received.txs].filter(([, x]) => !x.isSigner).map(([h]) => h);
const otherTxs = await readTxs(sampleHashes(others, 200, `${DAY}:others`));
result.otherSigners = {
  hourTransactions: received.txs.size, notSignedByIntents: others.length, read: otherTxs.length,
  withSwaps: otherTxs.filter((x) => swapsOfTx(x).length).length,
  signers: tally(otherTxs, (x) => x.transaction?.signer_id).slice(0, 8),
  swapSigners: tally(otherTxs.filter((x) => swapsOfTx(x).length), (x) => x.transaction?.signer_id).slice(0, 8),
  minutes: minutes(t),
};
save();

// 4. The census: every transaction of the day whose dip4 logs name a solver seen in the sample.
t = Date.now();
const census = new Map();
const perSolver = [];
for (const s of allSolvers) {
  const l = await listAccount({ account_id: s, is_event_log: true }, from, to);
  perSolver.push({ solver: s, transactions: l.txs.size, pages: l.pages, capped: l.capped });
  for (const [h, x] of l.txs) census.set(h, x);
}
const censusListMinutes = minutes(t);
t = Date.now();
const have = new Map(sampleTxs.map((x) => [x.transaction?.hash, x]));
const censusTxs = [...[...census.keys()].filter((h) => have.has(h)).map((h) => have.get(h)), ...(await readTxs([...census.keys()].filter((h) => !have.has(h))))];
result.census = { solvers: allSolvers.size, perSolver: perSolver.sort((a, b) => b.transactions - a.transactions), transactions: census.size, read: censusTxs.length, listMinutes: censusListMinutes, readMinutes: minutes(t) };
save();

// 5. Prices and decimals (pipeline/chain_io.mjs).
t = Date.now();
const tsOfTx = new Map([...settlement.txs, ...received.txs, ...census].map(([h, x]) => [h, x.ts]));
const all = [...new Map([...sampleTxs, ...otherTxs, ...censusTxs].map((x) => [x.transaction?.hash, x])).values()];
const perTx = all.map((x) => ({ hash: x.transaction?.hash, ts: tsOfTx.get(x.transaction?.hash), signer: x.transaction?.signer_id, diffs: diffsOfTx(x), swaps: swapsOfTx(x), tx: x }));
const tokens = new Set(perTx.flatMap((p) => p.diffs.flatMap((d) => [...d.give, ...d.get].map((x) => x.token))));
const { priceAt, dec, calls: priceCalls } = await priceBook(perTx.flatMap((p) => p.diffs.flatMap((d) => [...d.give, ...d.get].map((x) => ({ ts: p.ts, token: x.token })))));
result.pricing = { tokens: tokens.size, withDecimals: [...tokens].filter((x) => dec(x) != null).length, llamaMapped: [...tokens].filter(llamaId).length, priceCalls, minutes: minutes(t) };
save();

// 6. Measurements.
const byHash = new Map();
for (const p of perTx) {
  const price = priceAt(p.ts);
  const users = new Set(p.swaps.map((s) => s.intentHash));
  const swaps = p.swaps.map((s) => ({ ...s, usdIn: usdOf(s.give, price, dec), usdOut: usdOf(s.get, price, dec), agree: sideAgreement(s, price, dec), bps: feeBps(s), solvers: solversOfSwap([p.tx], users) }))
    .map((s) => ({ ...s, usd: s.usdIn ?? s.usdOut }));
  byHash.set(p.hash, { ...p, swaps, allHalf: sum(p.diffs.map((d) => usdOf(d.give, price, dec) ?? 0)) / 2 });
}
function describe(rows) {
  const swaps = rows.flatMap((r) => r.swaps);
  const priced = swaps.filter((s) => s.usd != null);
  const usd = sum(priced.map((s) => s.usd));
  const unknown = swaps.filter((s) => s.referral === '1click-unknown');
  const agree = swaps.map((s) => s.agree).filter((x) => x != null);
  return {
    transactions: rows.length, withSwaps: rows.filter((r) => r.swaps.length).length, swaps: swaps.length, pricedShare: share(priced.length, swaps.length), usdIn: Math.round(usd),
    usdInPlusOut: Math.round(sum(swaps.filter((s) => s.usdIn != null && s.usdOut != null).map((s) => s.usdIn + s.usdOut))),
    largestSwapUsd: Math.round(Math.max(0, ...priced.map((s) => s.usd))), top10UsdShare: share(sum(priced.map((s) => s.usd).sort((a, b) => b - a).slice(0, 10)), usd),
    sideAgreement: { checked: agree.length, median: median(agree), within5pct: share(agree.filter((x) => Math.abs(x - 1) <= 0.05).length, agree.length) },
    unknown: { swapShare: share(unknown.length, swaps.length), usdShare: share(sum(unknown.filter((s) => s.usd != null).map((s) => s.usd)), usd) },
    referrals: { distinct: new Set(swaps.map((s) => s.referral)).size, byUsd: tally(priced, (s) => s.referral, (s) => s.usd).slice(0, 12).map(([r, u]) => [r, Math.round(u)]) },
    appFee: { share: share(swaps.filter((s) => s.appFees.length).length, swaps.length), readableBps: share(swaps.filter((s) => s.bps != null).length, swaps.length) },
    protocolFeeBps: median(swaps.map((s) => { const f = s.protocolFees[0], g = f && s.give.find((x) => x.token === f.token); return g ? Math.round((Number(f.raw) / Number(g.raw)) * 1e7) / 1e3 : null; })),
    solvers: { resolved: share(swaps.filter((s) => s.solvers.length).length, swaps.length), top: tally(swaps.flatMap((s) => s.solvers), (a) => a).slice(0, 6) },
    topUnpriced: tally(swaps.filter((s) => s.usd == null).flatMap((s) => s.give.map((x) => x.token)), (x) => x).slice(0, 8),
    worstAgreement: swaps.filter((s) => s.agree != null && Math.abs(s.agree - 1) > 0.05).sort((a, b) => Math.abs(b.agree - 1) - Math.abs(a.agree - 1)).slice(0, 6).map((s) => ({ hash: s.hash, agree: Math.round(s.agree * 1000) / 1000, give: s.give.map((x) => x.token), get: s.get.map((x) => x.token) })),
  };
}
const sampleRows = sample.map((h) => byHash.get(h)).filter(Boolean);
const censusRows = [...census.keys()].map((h) => byHash.get(h)).filter(Boolean);
const llamaChart = (await getJson('https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume')).totalDataChart;
const llamaDay = llamaChart.find(([d]) => new Date(d * 1000).toISOString().slice(0, 10) === DAY)?.[1] ?? null;
const ratio = (x) => (llamaDay && x != null ? Math.round((x / llamaDay) * 1000) / 1000 : null);

const testSwaps = sampleRows.filter((r) => rank.get(r.hash) >= SAMPLE / 2).flatMap((r) => r.swaps);
const covered = testSwaps.filter((s) => s.solvers.some((x) => trainSolvers.has(x)));
const sampleSwapTxs = sampleRows.filter((r) => r.swaps.length);
const inSample = { ...describe(sampleRows), extrapolatedUsdIn: extrapolate(sampleRows.map((r) => sum(r.swaps.map((s) => s.usd ?? 0))), N) };
const inCensus = describe(censusRows);
result.measure = {
  sample: inSample,
  census: { ...inCensus, nonSettlementTransactions: censusRows.filter((r) => !settlement.txs.has(r.hash)).length, nonSettlementSwaps: censusRows.filter((r) => !settlement.txs.has(r.hash)).flatMap((r) => r.swaps).length },
  coverage: {
    trainSolvers: trainSolvers.size, testSwaps: testSwaps.length,
    testSwapsByTrainSolvers: share(covered.length, testSwaps.length),
    testUsdByTrainSolvers: share(sum(covered.map((s) => s.usd ?? 0)), sum(testSwaps.map((s) => s.usd ?? 0))),
    sampleSwapTxsInCensus: share(sampleSwapTxs.filter((r) => census.has(r.hash)).length, sampleSwapTxs.length),
    // Census swaps over the sample's estimate of all swaps: near 1 if the census misses little.
    censusOverSampleSwaps: share(inCensus.swaps, (inSample.swaps / sampleRows.length) * N),
  },
  volume: {
    defiLlamaDay: llamaDay,
    sampleUsdIn: { ...inSample.extrapolatedUsdIn, vsDefiLlama: ratio(inSample.extrapolatedUsdIn.total) },
    censusUsdIn: { total: inCensus.usdIn, vsDefiLlama: ratio(inCensus.usdIn) },
    censusUsdInPlusOut: { total: inCensus.usdInPlusOut, vsDefiLlama: ratio(inCensus.usdInPlusOut) },
    censusAllTokenDiffHalf: { total: Math.round(sum(censusRows.map((r) => r.allHalf))), vsDefiLlama: ratio(sum(censusRows.map((r) => r.allHalf))) },
  },
};
result.dailyMinutes = minutes(t0);
result.fastnear = { ...fastStats };
result.rpcCalls = fastStats.rpcCalls;
save();

// 7. The fee-account route on fee accounts that serve one referral (at least 90% of their swaps in the census).
t = Date.now();
const censusSwaps = censusRows.flatMap((r) => r.swaps);
const singles = tally(censusSwaps.flatMap((s) => s.appFees.map((f) => f.recipient)), (r) => r)
  .map(([recipient, n]) => ({ recipient, n, refs: tally(censusSwaps.filter((s) => s.appFees.some((f) => f.recipient === recipient)), (s) => s.referral) }))
  .filter((x) => x.n >= 20 && x.refs[0][1] / x.n >= 0.9).slice(0, 3);
if (FEE_WEEKS) await feeRoute(singles.map((x) => ({ recipient: x.recipient, referral: x.refs[0][0], daySwaps: x.n })));
result.feeRouteMinutes = minutes(t);
result.totalMinutes = minutes(t0);
result.fastnear = { ...fastStats };
result.rpcCalls = fastStats.rpcCalls;
result.finishedAt = new Date().toISOString();
save();

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const usdM = (x) => (x == null ? 'n/a' : `$${(x / 1e6).toFixed(1)}M`);
const m = result.measure, v = m.volume;
const summary = [
  `## Chain spike, ${DAY}`,
  `- Settlement transactions ${N} (${result.listing.minutes} min to list); sample ${sampleTxs.length} (${result.reading.minutes} min)`,
  `- Census: ${result.census.solvers} solvers, ${result.census.transactions} transactions (${result.census.listMinutes} + ${result.census.readMinutes} min), ${m.census.swaps} swaps; ${m.census.nonSettlementSwaps} in transactions intents.near did not sign`,
  `- Coverage: train solvers fill ${pct(m.coverage.testSwapsByTrainSolvers)} of held-out swaps (${pct(m.coverage.testUsdByTrainSolvers)} of USD); census over sample estimate ×${m.coverage.censusOverSampleSwaps}`,
  `- Other signers, first hour: ${result.otherSigners.notSignedByIntents} of ${result.otherSigners.hourTransactions}; ${result.otherSigners.withSwaps} of ${result.otherSigners.read} read have swaps`,
  `- Run ${result.dailyMinutes} min. FastNEAR calls ${fastStats.calls}, 429s ${fastStats.r429}, errors ${fastStats.errors}`,
  `- Census priced ${pct(m.census.pricedShare)}; sides agree within 5% on ${pct(m.census.sideAgreement.within5pct)}; 1click-unknown ${pct(m.census.unknown.swapShare)} of swaps, ${pct(m.census.unknown.usdShare)} of USD`,
  `- Volume vs DefiLlama ${usdM(v.defiLlamaDay)}: census in ${usdM(v.censusUsdIn.total)} (×${v.censusUsdIn.vsDefiLlama}), in+out ×${v.censusUsdInPlusOut.vsDefiLlama}, all token_diff ÷ 2 ×${v.censusAllTokenDiffHalf.vsDefiLlama}; sample ${usdM(v.sampleUsdIn.total)} (${usdM(v.sampleUsdIn.lo)} to ${usdM(v.sampleUsdIn.hi)})`,
  `- Fee route: ${result.feeRoute.map((f) => `${f.referral} (${f.recipient.slice(0, 8)}) ${f.steps.length} steps`).join('; ')} (${result.feeRouteMinutes} min)`,
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
