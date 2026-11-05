// Computes the five readings, the verdict and the V* band from files only (no network) and writes data/published/thesis.json (U6).
// Inputs: data/snapshot/defillama_daily.json, data/published/model_inputs.json, data/labels/frontends.json, and once the chain sample
// exists (T2 to T5) data/snapshot/days, data/published/fee_trace.json (T4) and data/published/elasticity.json. A reading whose input is missing is Not Measured.
// Usage: node pipeline/build_thesis.mjs   (OUT overrides the output path)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { q1, q2, q3, q4, q5, verdict, largestIntegrator, largestIntegratorBySize, runRates } from '../analysis/readings.mjs';
import { thesisText } from '../analysis/thesis_text.mjs';
import { vStar, vStarRange } from '../lib/model.ts';

const OUT = process.env.OUT ?? 'data/published/thesis.json';
const PUB = process.env.PUBLISHED_DIR ?? 'data/published'; // verify points this at the copy it checks
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

const elasticity = existsSync(`${PUB}/elasticity.json`) ? json(`${PUB}/elasticity.json`) : null;
const inputs = json(`${PUB}/model_inputs.json`);
const llama = json('data/snapshot/defillama_daily.json');
const labels = json('data/labels/frontends.json').labels;

// Snapshot rows of the last 30 days.
const dayFiles = (existsSync('data/snapshot/days') ? readdirSync('data/snapshot/days') : []).filter((f) => f.endsWith('.csv.gz')).sort();
const lastSnapshotDay = dayFiles.at(-1)?.slice(0, 10) ?? null;
// The last frozen chain day (T2) is what the Data Is Late banner reads. Q4 and the solver columns still wait for T3 to T6 to read these days.
const chainDays = (existsSync('data/chain') ? readdirSync('data/chain') : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
const lastChainDay = chainDays.at(-1)?.slice(0, 10) ?? null;
const rows = dayFiles.slice(-30).flatMap((f) =>
  gunzipSync(readFileSync(`data/snapshot/days/${f}`)).toString().split('\n').slice(1).filter(Boolean).map((l) => {
    const [day, referral, fee_bps, bucket, , usd_in] = l.split(',');
    return { day, referral, bucket, fee_bps: Number(fee_bps), usd_in: Number(usd_in) };
  }),
);

const top = lastSnapshotDay && largestIntegrator(rows, lastSnapshotDay, 30);

// Q3 and E3 from the realised cost of the last 7 frozen chain days (T4, PREREG.md sections 5 and 8), as built into fee_trace.json.
const trace = existsSync(`${PUB}/fee_trace.json`) ? json(`${PUB}/fee_trace.json`) : null;
const solvers = trace && {
  recent: trace.solvers, beforeSwitch: null,
  source: `intents.near chain days ${trace.from} to ${trace.to}: USD per filler account, token_diff and transfer swaps, the hub as one account`,
  query: 'analysis/realised_cost.mjs solverConcentrationChain → data/published/fee_trace.json',
};
const label = top && labels.find((l) => l.referral === top.referral);
const spread = trace?.q3.spreadBps ?? null;

const R = [
  { id: 'Q1', name: 'Pricing Power', ...q1(elasticity?.main.usable >= 3 ? elasticity.main.e1 : null),
    plain: 'Whether raising a fee brings in more revenue. It is Bullish only if the whole interval is above -1.', source: 'intents.near chain sample', query: 'analysis/elasticity.mjs → data/published/elasticity.json' },
  { id: 'Q2', name: "NEAR's Share of Fees", ...q2(llama.days),
    plain: 'The part of Intents fees that DefiLlama books as revenue. Bullish above 30%; Bearish only if it was under 20% on each of the last 14 days.', source: 'DefiLlama, all Intents', query: 'analysis/readings.mjs q2 → data/snapshot/defillama_daily.json' },
  { id: 'Q3', name: 'Solver Competition', ...q3({ spreadBps: spread, top3: solvers?.recent.allSizes.top3 ?? null }),
    plain: 'Two numbers: what solvers keep on $1k to $10k swaps, and how much of the volume the top 3 solvers fill. Bullish under 5 bps and 60%; Bearish over 10 bps or 80%.', source: trace ? `intents.near chain days ${trace.from} to ${trace.to}, DefiLlama hourly prices` : 'intents.near chain days; not built yet', query: 'analysis/realised_cost.mjs q3Spread, solverConcentrationChain → data/published/fee_trace.json' },
  { id: 'Q4', name: 'Largest Integrator', ...q4(top?.share ?? null, label ? label.name : top ? 'An unlabelled frontend' : null),
    plain: 'The largest frontend\'s share of the fees paid over the last 30 days. Bullish under 50%; Bearish over 80%.', source: 'intents.near chain sample', query: 'analysis/readings.mjs largestIntegrator → data/snapshot/days' },
  { id: 'Q5', name: 'Path to Deflation', ...q5(runRates(llama.days)),
    plain: 'Whether the 90-day revenue total rose (or fell) at each of the last three month-ends.', source: 'DefiLlama, all Intents', query: 'analysis/readings.mjs q5 → data/snapshot/defillama_daily.json' },
];
const v = verdict(R.map((r) => r.side));

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
  // S6: largest frontend's share of fees per size bucket, last 30 days of the chain sample. Solver columns need solver data.
  concentration: lastSnapshotDay && {
    window: '30 days to ' + lastSnapshotDay,
    source: 'intents.near chain sample',
    query: 'analysis/readings.mjs largestIntegratorBySize → data/snapshot/days',
    bySize: Object.fromEntries(
      Object.entries(largestIntegratorBySize(rows, lastSnapshotDay, 30, ['0-1k', '1k-10k', '10k-100k', '100k+'])).map(([b, t]) => {
        const l = t && labels.find((x) => x.referral === t.referral);
        return [b, t && { name: l ? l.name : 'Unlabelled frontend', share: t.share }];
      }),
    ),
    solvers: solvers && { days: solvers.recent.days, stability: solvers.recent.stability, bySize: Object.fromEntries(Object.entries(solvers.recent.bySize).map(([b, x]) => [b, { top3: x.top3, hhi: x.hhi, sampled: x.sampled }])), allSizes: solvers.recent.allSizes },
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
const named = (list, ref) => list.find((l) => l.referral === ref)?.name ?? null;
const shown = [top?.referral, ...(lastSnapshotDay ? Object.values(largestIntegratorBySize(rows, lastSnapshotDay, 30, ['0-1k', '1k-10k', '10k-100k', '100k+'])).map((t) => t?.referral) : [])].filter(Boolean);
result.labelCheck = {
  rule: "Labels with confidence 'secondary' dropped; the readings use referral names, so sides and shares stay the same",
  secondaryLabels: labels.length - sourcedOnly.length,
  sidesChange: q4(top?.share ?? null, top ? (named(sourcedOnly, top.referral) ?? 'An unlabelled frontend') : null).side !== R.find((r) => r.id === 'Q4').side,
  namesThatChange: [...new Set(shown)].filter((r) => named(labels, r) !== named(sourcedOnly, r)).map((r) => ({ referral: r, label: named(labels, r), without: 'Unlabelled frontend' })),
};
result.text = thesisText(result); // FR-15: sentences picked from the readings above, so verify checks the words too
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
for (const r of R) console.log(`${r.id} ${r.name}: ${r.side} (${r.detail})`);
console.log(`Verdict: ${v.verdict} (score ${v.score}, ${v.missing} not measured) -> ${OUT}`);
console.log(`V* at 1.6%: $${(v16.mid / 1e9).toFixed(2)}B (${v16.low / 1e9 | 0}..${(v16.high / 1e9).toFixed(1)}), ${result.vstar.multiple16.toFixed(1)}x today; at 2.5%: $${(v25.mid / 1e9).toFixed(2)}B`);
