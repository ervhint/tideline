// Saves DefiLlama's daily fees and revenue for Intents to data/snapshot/defillama_daily.json, so the readings (U6) can be rerun without the network.
// DefiLlama takes this from a Dune dataset nobody can re-run for free (AGENTS.md), so the saved file is the evidence.
// Usage: node pipeline/pull_defillama.mjs   (OUT overrides the output path)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getJson } from './http.mjs';

const OUT = process.env.OUT ?? 'data/snapshot/defillama_daily.json';
const COW_OUT = process.env.COW_OUT ?? 'data/snapshot/cow_daily.json'; // the elasticity control venue (D14)
const get = getJson;
const byDay = (chart) => new Map(chart.map(([t, v]) => [new Date(t * 1000).toISOString().slice(0, 10), v]));

const fees = byDay((await get('https://api.llama.fi/summary/fees/near-intents')).totalDataChart);
const rev = byDay((await get('https://api.llama.fi/summary/fees/near-intents?dataType=dailyRevenue')).totalDataChart);
const today = new Date().toISOString().slice(0, 10); // today is unfinished, so it is left out
const days = [...fees.keys()].filter((d) => d < today).sort().map((day) => ({ day, fees: fees.get(day), revenue: rev.get(day) ?? 0 }));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ pulledAt: new Date().toISOString(), source: 'DefiLlama fees/near-intents (dailyFees, dailyRevenue), all Intents', days }, null, 1) + '\n');
console.log(`${days.length} days, ${days[0].day} to ${days.at(-1).day} -> ${OUT}`);

const cow = byDay((await get('https://api.llama.fi/summary/aggregators/cowswap?dataType=dailyVolume')).totalDataChart);
const cowDays = [...cow.keys()].filter((d) => d < today).sort().map((day) => ({ day, volume: cow.get(day) }));
mkdirSync(dirname(COW_OUT), { recursive: true });
writeFileSync(COW_OUT, JSON.stringify({ pulledAt: new Date().toISOString(), source: 'DefiLlama aggregators/cowswap dailyVolume', days: cowDays }, null, 1) + '\n');
console.log(`${cowDays.length} CoW Swap days, ${cowDays[0].day} to ${cowDays.at(-1).day} -> ${COW_OUT}`);

// FR-21: more control venues, the large multi-chain aggregators with daily volume back to Sep 2025 (checked 3 Nov 2026).
// UniswapX has no DefiLlama entry, and the Uniswap aggregator starts on 2026-05-31, too late for most fee changes.
const VENUES_OUT = process.env.VENUES_OUT ?? 'data/snapshot/control_venues.json';
const VENUES =[['1inch-swap', '1inch'], ['0x-aggregator', '0x'], ['kyberswap-aggregator', 'KyberSwap'], ['li.fi-dex-aggregator', 'LI.FI']];
const venues = {};
for (const [slug, name] of VENUES) {
  const v = byDay((await get(`https://api.llama.fi/summary/aggregators/${slug}?dataType=dailyVolume`)).totalDataChart);
  venues[slug] = { name, days: [...v.keys()].filter((d) => d < today && d >= '2025-08-01').sort().map((day) => ({ day, volume: v.get(day) })) };
}
writeFileSync(VENUES_OUT, JSON.stringify({ pulledAt: new Date().toISOString(), source: 'DefiLlama aggregators/<slug> dailyVolume, from 2025-08-01', venues }, null, 1) + '\n');
console.log(`${VENUES.length} more control venues -> ${VENUES_OUT}`);
