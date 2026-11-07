// Computes the five readings, the verdict and the V* band from files only (no network) and writes data/published/thesis.json (U6).
// Inputs: data/snapshot/defillama_daily.json, data/published/model_inputs.json, data/labels/frontends.json, the last 30 frozen chain days in data/chain (Q4, T6),
// data/published/fee_trace.json (T4), data/published/elasticity.json (T5) and data/published/confidential.json (T6b). A reading whose input is missing is Not Measured.
// Usage: node pipeline/build_thesis.mjs   (OUT overrides the output path)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { q1, q2, q3, q4, q5, verdict, runRates, PRIVATE_LINE } from '../analysis/readings.mjs';
import { parseDayFile } from '../analysis/chain_day.mjs';
import { integratorShares } from '../analysis/integrator.mjs';
import { treasuryShare } from '../analysis/treasury.mjs';
import { thesisText } from '../analysis/thesis_text.mjs';
import { vStar, vStarRange } from '../lib/model.ts';

const OUT = process.env.OUT ?? 'data/published/thesis.json';
const PUB = process.env.PUBLISHED_DIR ?? 'data/published'; // verify points this at the copy it checks
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

const elasticity = existsSync(`${PUB}/elasticity.json`) ? json(`${PUB}/elasticity.json`) : null;
const inputs = json(`${PUB}/model_inputs.json`);
const llama = json('data/snapshot/defillama_daily.json');
const labels = json('data/labels/frontends.json').labels;

// The last 30 frozen chain days (PREREG A1). The last one is also what the Data Is Late banner reads.
const CHAIN = process.env.CHAIN_DIR ?? 'data/chain';
const chainDays = (existsSync(CHAIN) ? readdirSync(CHAIN) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
const lastChainDay = chainDays.at(-1)?.slice(0, 10) ?? null;
const window30 = chainDays.slice(-30).map((f) => {
  const p = parseDayFile(readFileSync(`${CHAIN}/${f}`, 'utf8'), f.slice(0, 10));
  if (p.problems.length) throw new Error(`${f}: ${p.problems.join('; ')}`);
  return p;
});
const integ = window30.length ? integratorShares(window30) : null;
const top = integ?.largest ?? null;
// A label is looked up without the 1click- prefix (frontends.json keys); an unlabelled referral keeps its raw name.
const nameOf = (list, ref) => list.find((l) => l.referral === ref.replace(/^1click-/, ''))?.name ?? null;
const span = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000 + 1;

// Q3 and E3 from the realised cost of the last 7 frozen chain days (T4, PREREG.md sections 5 and 8), as built into fee_trace.json.
const trace = existsSync(`${PUB}/fee_trace.json`) ? json(`${PUB}/fee_trace.json`) : null;
const solvers = trace && {
  recent: trace.solvers, beforeSwitch: null,
  source: `intents.near chain days ${trace.from} to ${trace.to}: USD per filler account on public swaps, the Confidential Intents treasury left out (PREREG A2)`,
  query: 'analysis/realised_cost.mjs solverConcentrationChain → data/published/fee_trace.json',
};
const spread = trace?.q3.spreadBps ?? null;

// A2: each reading's own window decides whether its flow went private.
const treasury7 = trace?.treasury ?? null;
const treasury30 = window30.length ? treasuryShare(window30) : null;
const confidential = existsSync(`${PUB}/confidential.json`) ? json(`${PUB}/confidential.json`) : null;

const R = [
  { id: 'Q1', name: 'Pricing Power', ...q1(elasticity?.main.usable >= 3 ? elasticity.main.e1 : null, elasticity ? elasticity.main.usable : null),
    plain: 'Whether raising a fee brings in more revenue. It is Bullish only if the whole interval is above -1.', source: 'intents.near token_diff swaps, frozen chain days', query: 'analysis/elasticity.mjs → data/published/elasticity.json' },
  { id: 'Q2', name: "NEAR's Share of Fees", ...q2(llama.days),
    plain: 'The part of Intents fees that DefiLlama books as revenue. Bullish above 30%; Bearish only if it was under 20% on each of the last 14 days.', source: 'DefiLlama, all Intents', query: 'analysis/readings.mjs q2 → data/snapshot/defillama_daily.json' },
  { id: 'Q3', name: 'Solver Competition', ...q3({ spreadBps: spread, top3: solvers?.recent.allSizes.top3 ?? null, treasuryShare: treasury7?.share ?? null }),
    plain: 'Two numbers: what solvers keep on $1k to $10k public swaps, and how much of the public volume the top 3 solvers fill. Bullish under 5 bps and 60%; Bearish over 10 bps or 80%. Not Measured when the Confidential Intents treasury carries over 50% of the last 7 days.', source: trace ? `intents.near chain days ${trace.from} to ${trace.to}, DefiLlama hourly prices` : 'intents.near chain days; not built yet', query: 'analysis/realised_cost.mjs q3Spread, solverConcentrationChain → data/published/fee_trace.json' },
  { id: 'Q4', name: 'Largest Integrator', ...q4(top?.share ?? null, top ? (nameOf(labels, top.referral) ?? top.referral) : null, treasury30?.share ?? null),
    plain: 'The largest frontend\'s share of the app fees paid on token_diff swaps over the last 30 frozen days. Bullish under 50%; Bearish over 80%. Not Measured when the Confidential Intents treasury carries over 50% of those days.',
    source: integ ? `intents.near token_diff swaps, chain days ${integ.days[0]} to ${integ.days.at(-1)}` : 'intents.near chain days; none frozen yet',
    query: 'analysis/integrator.mjs integratorShares → data/chain/*.jsonl' },
  { id: 'Q5', name: 'Path to Deflation', ...q5(runRates(llama.days)),
    plain: 'Whether the 90-day revenue total rose (or fell) at each of the last three month-ends.', source: 'DefiLlama, all Intents', query: 'analysis/readings.mjs q5 → data/snapshot/defillama_daily.json' },
];
const v = verdict(R.map((r) => r.side), R.filter((r) => r.privateFlow).map((r) => r.id));

// The V* band (monthly volume that makes buybacks cover issuance), on today's inputs.
const m = {
  supply: inputs.supply.now, revenueRate: inputs.revenueRate, revenueRateRange: inputs.revenueRateRange,
  gasBurnNearPerYear: inputs.issuance.gasBurnNearPerYear, todayVolume: inputs.volume30dUsd, priceUsd: inputs.priceUsd,
};
const at = (issuancePct) => vStarRange({ issuancePct, price: m.priceUsd, buybackShare: 1 }, m);
const v16 = at(1.6), v25 = at(2.5);

const result = {
  asOf: inputs.asOf,
  prereg: 'PREREG.md',
  snapshotLastDay: lastChainDay,
  readings: R,
  verdict: v,
  // A2: how much of each reading's window went through the treasury, and the confidential share (a side measure: it sets no reading).
  privateFlow: {
    line: PRIVATE_LINE, q3: treasury7 && { days: treasury7.days, share: treasury7.share }, q4: treasury30 && { days: treasury30.days, share: treasury30.share },
    confidential: confidential && { last7: confidential.last7, last30: confidential.last30 },
  },
  // S6: largest frontend's share of fees per size bucket over the same 30 days (A1), and the solver columns from fee_trace.json (PREREG 5).
  concentration: integ && {
    window: `${integ.days.length} chain days, ${integ.days[0]} to ${integ.days.at(-1)}`,
    days: integ.days.length, gapsInWindow: span(integ.days[0], integ.days.at(-1)) - integ.days.length,
    source: 'intents.near token_diff swaps, app fee paid per referral',
    query: 'analysis/integrator.mjs integratorShares → data/chain/*.jsonl',
    tokenDiffShareOfUsd: integ.tokenDiffShareOfUsd,
    feeUnreadable: integ.feeUnreadable,
    largest: top && { referral: top.referral, name: nameOf(labels, top.referral) ?? top.referral, share: top.share, shareOfNamed: top.shareOfNamed, feeUsd: top.feeUsd, totalFeeUsd: top.totalFeeUsd },
    bySize: Object.fromEntries(Object.entries(integ.bySize).map(([b, t]) => [b, t && { referral: t.referral, name: nameOf(labels, t.referral) ?? t.referral, share: t.share }])),
    solvers: solvers && { days: solvers.recent.days, stability: solvers.recent.stability, bySize: Object.fromEntries(Object.entries(solvers.recent.bySize).map(([b, x]) => [b, { top3: x.top3, hhi: x.hhi, sampled: x.sampled }])), allSizes: solvers.recent.allSizes, tokenDiffOnly: { top3: solvers.recent.tokenDiffOnly.top3 } },
  },
  solvers,
  vstar: { todayUsd: m.todayVolume, priceUsd: m.priceUsd, at16: v16, at25: v25, multiple16: v16.mid / m.todayVolume, multiple25: v25.mid / m.todayVolume },
  notes: {
    llamaLastDay: llama.days.at(-1).day,
    llamaLastDayCapture: llama.days.at(-1).revenue / llama.days.at(-1).fees,
  },
};
// FR-04: rerun with uncertain labels dropped. Every number is keyed by referral, so only names can change; this shows which.
const sourcedOnly = labels.filter((l) => l.confidence === 'sourced');
const shown = [top?.referral, ...Object.values(integ?.bySize ?? {}).map((t) => t?.referral)].filter(Boolean);
result.labelCheck = {
  rule: "Labels with confidence 'secondary' dropped; the readings use referral names, so sides and shares stay the same",
  secondaryLabels: labels.length - sourcedOnly.length,
  sidesChange: false,
  namesThatChange: [...new Set(shown)].filter((r) => nameOf(labels, r) !== nameOf(sourcedOnly, r)).map((r) => ({ referral: r, label: nameOf(labels, r), without: r })),
};
result.text = thesisText(result); // FR-15: sentences picked from the readings above, so verify checks the words too
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
for (const r of R) console.log(`${r.id} ${r.name}: ${r.side} (${r.detail})`);
console.log(`Verdict: ${v.verdict} (score ${v.score}, ${v.missing} not measured${v.held.length ? `, held by ${v.held.join(' and ')}` : ''}) -> ${OUT}`);
console.log(`V* at 1.6%: $${(v16.mid / 1e9).toFixed(2)}B (${v16.low / 1e9 | 0}..${(v16.high / 1e9).toFixed(1)}), ${result.vstar.multiple16.toFixed(1)}x today; at 2.5%: $${(v25.mid / 1e9).toFixed(2)}B`);
