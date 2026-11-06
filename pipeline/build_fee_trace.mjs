// Realised cost of on-chain swaps over the last 7 frozen chain days (T4, PREREG.md sections 5, 7 and 8, amendment A2) -> data/published/fee_trace.json.
// No network: reads data/chain/*.jsonl, data/snapshot/protocol_fee.json and data/published/model_inputs.json. CHAIN_DIR / OUT / PUBLISHED_DIR override paths.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDayFile } from '../analysis/chain_day.mjs';
import { feeTrace, q3Spread, solverConcentrationChain, PRICE_BAND } from '../analysis/realised_cost.mjs';
import { treasuryShare, TREASURY } from '../analysis/treasury.mjs';

const dir = process.env.CHAIN_DIR ?? 'data/chain';
const out = process.env.OUT ?? 'data/published/fee_trace.json';
const pub = process.env.PUBLISHED_DIR ?? 'data/published';
const WINDOW = 7;

const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().slice(-WINDOW);
if (!files.length) throw new Error(`no frozen chain days in ${dir}`);
const days = files.map((f) => {
  const p = parseDayFile(readFileSync(`${dir}/${f}`, 'utf8'), f.slice(0, 10));
  if (p.problems.length) throw new Error(`${f}: ${p.problems.join('; ')}`);
  return p;
});
const protocol = JSON.parse(readFileSync('data/snapshot/protocol_fee.json', 'utf8'));
const inputs = JSON.parse(readFileSync(`${pub}/model_inputs.json`, 'utf8'));
const span = (Date.parse(`${days.at(-1).head.day}T00:00:00Z`) - Date.parse(`${days[0].head.day}T00:00:00Z`)) / 86_400_000 + 1;

const result = {
  prereg: 'PREREG.md sections 5, 7 and 8, amendment A2',
  from: days[0].head.day, to: days.at(-1).head.day, days: days.length, gapsInWindow: span - days.length,
  priceBand: PRICE_BAND,
  protocolFee: { bps: protocol.feeBps, collector: protocol.collector, source: protocol.source, readAt: protocol.readAt.at },
  trace: feeTrace(days, protocol.feeBps),
  q3: q3Spread(days, protocol.feeBps),
  solvers: solverConcentrationChain(days),
  treasury: { account: TREASURY, ...treasuryShare(days) },
  nearRevenue: {
    bps: inputs.revenueRate * 1e4, from: inputs.window.from, to: inputs.window.to,
    source: 'DefiLlama revenue ÷ volume, all Intents (data/published/model_inputs.json)',
    buyback: 'Since 2026-02-23 NEAR uses its captured Intents revenue to buy NEAR on the open market; the bought NEAR is not burned (DefiLlama methodology)',
  },
  query: 'analysis/realised_cost.mjs feeTrace, q3Spread, solverConcentrationChain over data/chain/*.jsonl, by pipeline/build_fee_trace.mjs',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
const a = result.trace.bySize['1k-10k'].all;
console.log(`${days.length} chain days ${result.from} to ${result.to} -> ${out}`);
console.log(`$1k-10k public: all-in ${a.allInBps?.toFixed(2)} bps = app ${a.appFeeBps?.toFixed(2)} + protocol ${a.protocolBps?.toFixed(2)} + spread ${a.spreadBps?.toFixed(2)} (gap ${a.partsGapBps})`);
console.log(`Q3 spread ${result.q3.spreadBps?.toFixed(2)} bps over ${result.q3.usableDays} days; top 3 ${result.solvers.allSizes.top3 == null ? 'none' : `${(result.solvers.allSizes.top3 * 100).toFixed(1)}%`}; treasury ${(result.treasury.share * 100).toFixed(1)}% of USD`);
