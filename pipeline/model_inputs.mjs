// Pulls the inputs of the threshold model (U4) from public sources and writes data/published/model_inputs.json.
// Supply and gas burn: NEAR RPC. Price: CoinGecko. Volume, revenue, buyback: DefiLlama (all Intents, a Dune dataset).
// Usage: node pipeline/model_inputs.mjs   (OUT overrides the output path)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getJson, retry } from './http.mjs';

const OUT = process.env.OUT ?? 'data/published/model_inputs.json';
const RPC = 'https://archival-rpc.mainnet.fastnear.com';
const NOMINAL_ISSUANCE_PCT = 2.5; // protocol parameter being voted on in HSP-029 (secondary sources); gas burn is derived from it
const WINDOW_DAYS = 30;
const BLOCKS_PER_SECOND = 1.7;

const get = getJson;
const block = (params) => retry('NEAR RPC', async () => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'block', params }), signal: AbortSignal.timeout(30_000) });
  const j = await r.json();
  if (j.error) throw new Error(`rpc ${JSON.stringify(j.error).slice(0, 120)}`);
  return j.result.header;
});
const near = (yocto) => Number(BigInt(yocto) / 10n ** 18n) / 1e6; // NEAR, to 6 decimals

// Supply now and about 30 days ago. Net growth is issuance minus burnt gas, so the gap to the nominal rate is the burn.
const now = await block({ finality: 'final' });
let then = await block({ block_id: now.height - Math.round(WINDOW_DAYS * 86400 * BLOCKS_PER_SECOND) });
const days = (Number(BigInt(now.timestamp) - BigInt(then.timestamp)) / 1e9) / 86400;
const supplyNow = near(now.total_supply);
const supplyThen = near(then.total_supply);
const netGrowthPctYear = ((supplyNow - supplyThen) / supplyThen) * (365 / days) * 100;
const gasBurnNearPerYear = Math.max(0, (NOMINAL_ISSUANCE_PCT / 100) * supplyNow - ((supplyNow - supplyThen) * 365) / days);

const price = (await get('https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd')).near.usd;

const vol = await get('https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume');
const fees = await get('https://api.llama.fi/summary/fees/near-intents');
const rev = await get('https://api.llama.fi/summary/fees/near-intents?dataType=dailyRevenue');
const hold = await get('https://api.llama.fi/summary/fees/near-intents?dataType=dailyHoldersRevenue');
const byDay = (chart) => new Map(chart.map(([t, v]) => [new Date(t * 1000).toISOString().slice(0, 10), v]));
const V = byDay(vol.totalDataChart), R = byDay(rev.totalDataChart);
const lastDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); // last finished UTC day

// Rolling 30-day revenue per dollar of volume over the days since the 2026-02-23 buyback start: the range is V*'s interval.
const series = [...V.keys()].filter((d) => d >= '2026-02-23' && d <= lastDay).sort();
const rolling = [];
for (let i = WINDOW_DAYS - 1; i < series.length; i++) {
  const w = series.slice(i - WINDOW_DAYS + 1, i + 1);
  const v = w.reduce((s, d) => s + V.get(d), 0), r = w.reduce((s, d) => s + (R.get(d) ?? 0), 0);
  if (v > 0) rolling.push({ day: series[i], rate: r / v });
}
const rates = rolling.map((x) => x.rate);
const last30 = series.slice(-WINDOW_DAYS);
const vol30 = last30.reduce((s, d) => s + V.get(d), 0);
const rev30 = last30.reduce((s, d) => s + (R.get(d) ?? 0), 0);

const result = {
  asOf: new Date().toISOString(),
  lastFinishedDay: lastDay,
  window: { from: last30[0], to: last30.at(-1), days: WINDOW_DAYS },
  supply: { now: supplyNow, then: supplyThen, blockNow: now.height, blockThen: then.height, daysBetween: Number(days.toFixed(3)), netGrowthPctYear: Number(netGrowthPctYear.toFixed(3)), source: 'FastNEAR archival RPC, block header total_supply' },
  issuance: { nominalPctYear: NOMINAL_ISSUANCE_PCT, gasBurnNearPerYear: Math.round(gasBurnNearPerYear), note: 'Gas burn = nominal issuance minus measured supply growth. It rests on the 2.5% nominal rate, which comes from secondary sources.' },
  priceUsd: price,
  volume30dUsd: Math.round(vol30),
  revenue30dUsd: Math.round(rev30),
  feeBpsOfVolume: Number(((fees.total30d / vol.total30d) * 1e4).toFixed(2)),
  revenueRate: rev30 / vol30,
  revenueRateRange: { min: Math.min(...rates), max: Math.max(...rates), windows: rates.length, from: rolling[0]?.day, to: rolling.at(-1)?.day },
  buyback: { shareOfRevenue: hold.total30d && rev.total30d ? hold.total30d / rev.total30d : null, burned: false, note: 'DefiLlama: since 2026-02-23 revenue buys NEAR on the open market. The bought NEAR is not burned.' },
  source: { volume: 'DefiLlama dexs/near-intents (all Intents)', revenue: 'DefiLlama fees/near-intents dailyRevenue', price: 'CoinGecko simple/price' },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
console.log(JSON.stringify({ ...result, revenueRate: (result.revenueRate * 1e4).toFixed(2) + ' bps' }, null, 1));
