// `npm run model -- --issuance 1.6 [--price 4.41] [--buyback 100] [--growth 1.5]`
// Prints V* with its interval, today's volume, and the first month volume reaches it on the chosen growth path.
// Reads data/published/model_inputs.json (made by pipeline/model_inputs.mjs). No network.
import { readFileSync } from 'node:fs';
import { vStar, vStarRange, vStarPath, firstReached, issuancePctOn, revenueMaxFeeBps, atFee, MAX_SEEN_FEE_BPS } from '../lib/model.ts';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const file = process.env.INPUTS ?? 'data/published/model_inputs.json';
const p = JSON.parse(readFileSync(file, 'utf8'));
const m = {
  supply: p.supply.now, revenueRate: p.revenueRate, revenueRateRange: p.revenueRateRange,
  gasBurnNearPerYear: p.issuance.gasBurnNearPerYear, todayVolume: p.volume30dUsd, priceUsd: p.priceUsd, feeBps: p.feeBpsOfVolume,
};
const num = (k, d) => (args[k] === undefined ? d : Number(args[k]));
const issuancePct = num('issuance', 1.6), price = num('price', m.priceUsd), buyback = num('buyback', 100) / 100, growth = num('growth', 1);
if (![issuancePct, price, buyback, growth].every(Number.isFinite) || buyback <= 0) { console.error('Bad number in the arguments.'); process.exit(1); }

const i = { issuancePct, price, buybackShare: buyback };
const r = vStarRange(i, m);
const bn = (x) => `$${(x / 1e9).toFixed(2)}B`;
console.log(`V* at ${issuancePct}% issuance, NEAR $${price}, ${buyback * 100}% of revenue to buybacks (inputs as of ${p.asOf.slice(0, 10)}):`);
console.log(`  ${bn(r.mid)} a month (${bn(r.mid / 30.4)} a day), interval ${bn(r.low)} to ${bn(r.high)}`);
console.log(`  Interval: revenue per dollar of volume moved between ${(m.revenueRateRange.min * 1e4).toFixed(2)} and ${(m.revenueRateRange.max * 1e4).toFixed(2)} bps in rolling 30-day windows (${p.revenueRateRange.from} to ${p.revenueRateRange.to}); now ${(m.revenueRate * 1e4).toFixed(2)} bps.`);
console.log(`  Today: ${bn(m.todayVolume)} a month, so V* is ${(r.mid / m.todayVolume).toFixed(1)}x today.`);
const from = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
for (const [name, passes] of [['vote passes (HSP-029 schedule)', true], ['vote fails (2.5% stays)', false]]) {
  const path = vStarPath(m, price, buyback, passes, growth, from, 120);
  const hit = firstReached(path);
  console.log(`  ${name}: V* ${bn(path[0].vStar)} now, ${bn(path.at(-1).vStar)} in ${path.at(-1).month}; ${growth === 1 ? 'volume flat' : `volume x${growth} a year`}: ${hit ? (hit.index === 0 ? 'already reached' : `reached ${hit.month}`) : 'not reached within ten years'}`);
}

// FR-10: across the E1 interval. Elasticity leaves V* at today's fee alone; it sets the fee that maximizes revenue.
const el = JSON.parse(readFileSync(process.env.ELASTICITY ?? 'data/published/elasticity.json', 'utf8')).main?.e1;
if (el) {
  console.log(`  Elasticity ${el.estimate.toFixed(2)}, interval ${el.lo.toFixed(2)} to ${el.hi.toFixed(2)} (1Click only). Today's all-in fee ${m.feeBps} bps.`);
  for (const [name, e] of [['low end', el.lo], ['estimate', el.estimate], ['high end', el.hi]]) {
    const f = revenueMaxFeeBps(e);
    if (f === null) { console.log(`    ${name} ${e.toFixed(2)}: no revenue-maximizing fee, revenue keeps rising with the fee up to ${MAX_SEEN_FEE_BPS} bps (the largest fee in the events)`); continue; }
    const a = atFee(i, m, f, e);
    console.log(`    ${name} ${e.toFixed(2)}: revenue peaks at ${f.toFixed(1)} bps; there volume ~${bn(a.volume)} a month, V* ${bn(a.need)} (${a.multiple.toFixed(1)}x)`);
  }
} else console.log('  Elasticity: data/published/elasticity.json has no estimate, so no revenue-maximizing fee.');
