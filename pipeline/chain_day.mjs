// T2: the daily chain snapshot. Reads one finished UTC day of intents.near from FastNEAR and NEAR RPC, prices it from DefiLlama,
// and freezes it as data/chain/<day>.jsonl (file format: analysis/chain_day.mjs). Keyless public reads only (AGENTS.md data rule).
//
//   1. Fillers: data/chain/fillers.json lists the solvers and the transfer hub. It is carried forward and only grows. Once a week
//      (or when the file is missing) a seeded sample of the day's settlement transactions finds new ones.
//   2. Census: every transaction of the day whose dip4 logs name a filler, read in full.
//   3. Swaps: token_diff swaps with a referral, plus transfer swaps through the fillers; priced hourly from DefiLlama.
//   4. Freeze: written once and never changed. A day that cannot be read well enough (a capped listing, under 99% read,
//      no swaps) is not written: it stays a gap, shown and never filled in.
//
// Usage: node pipeline/chain_day.mjs [YYYY-MM-DD]   (default: yesterday UTC; it is over 2 hours after midnight, so the 03:17 schedule is safe)
//   env CHAIN_DIR (default data/chain), GAP_MS (FastNEAR pacing, default 1000), DISCOVER=1 (look for new fillers today)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chain } from './chain_io.mjs';
import { usdOf, sampleHashes } from '../analysis/chain_swaps.mjs';
import { compactTx, fillersOfSample, mergeFillers, swapsOfDay, dayFile, parseDayFile, MIN_READ_SHARE } from '../analysis/chain_day.mjs';

const DAY_MS = 86_400_000;
// A run that starts just after midnight must not freeze a day whose last transactions are still being indexed.
export const SETTLE_HOURS = 2;
export const REDISCOVER_DAYS = 7;
export const DISCOVER_SAMPLE = 2000;

export const defaultDay = (now) => new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
export const isOver = (day, now) => Date.parse(`${day}T00:00:00Z`) + DAY_MS + SETTLE_HOURS * 3_600_000 <= now.getTime();
export const needsDiscovery = (doc, day, force = false) => force || !doc || Date.parse(`${day}T00:00:00Z`) - Date.parse(`${doc.updated}T00:00:00Z`) >= REDISCOVER_DAYS * DAY_MS;

// io: the object chain() returns (or a stand-in with the same calls). Returns { text, fillersDoc, report } or throws with the reason the day is not frozen.
export async function runDay({ day, io, fillersDoc, discover = false, log = console.log }) {
  const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000;
  const from = await io.heightAt(dayStart), to = await io.heightAt(dayStart + 86_400);
  log(`${day}: blocks ${from} to ${to}`);

  let settlementTxs = null;
  if (needsDiscovery(fillersDoc, day, discover)) {
    const settlement = await io.listAccount({ account_id: 'intents.near', is_signer: true }, from, to);
    if (settlement.capped) throw new Error('the settlement listing was cut short, so the filler sample cannot be drawn');
    settlementTxs = settlement.txs.size;
    const sample = await io.readTxs(sampleHashes([...settlement.txs.keys()], DISCOVER_SAMPLE, `${day}:fillers`));
    const found = fillersOfSample(sample);
    fillersDoc = mergeFillers(fillersDoc, found, day);
    log(`${day}: sample of ${sample.length} found ${found.solvers.length} solvers and ${found.hubs.length} hubs; ${fillersDoc.fillers.length} fillers in all`);
  }
  if (!fillersDoc?.fillers.length) throw new Error('no fillers to read');
  const fillers = new Set(fillersDoc.fillers.map((f) => f.account));

  const census = new Map(); // hash -> ts (s)
  for (const a of fillers) {
    const l = await io.listAccount({ account_id: a, is_event_log: true }, from, to);
    if (l.capped) throw new Error(`the listing for ${a} was cut short`);
    for (const [h, x] of l.txs) census.set(h, x.ts);
  }
  log(`${day}: ${census.size} census transactions from ${fillers.size} fillers`);

  const hashes = [...census.keys()].sort();
  const rows = [];
  for (let i = 0; i < hashes.length; i += 20) {
    for (const x of await io.readTxs(hashes.slice(i, i + 20))) rows.push(compactTx(x, census.get(x.transaction?.hash), fillers));
    if ((i / 20) % 250 === 249) log(`${day}: read ${rows.length} of ${hashes.length}`);
  }
  const readShare = hashes.length ? rows.length / hashes.length : 0;
  if (readShare < MIN_READ_SHARE) throw new Error(`only ${rows.length} of ${hashes.length} census transactions could be read`);

  const swaps = swapsOfDay(rows, fillers);
  if (!swaps.length) throw new Error('no swaps found, so the day is not frozen');
  const { priceAt, dec, prices } = await io.priceBook(swaps.flatMap((s) => [...s.give, ...s.get].map((x) => ({ ts: s.ts, token: x.token }))));
  const usdAt = (ts, side) => usdOf(side, priceAt(ts), dec);
  const tokens = [...new Set(swaps.flatMap((s) => [...s.give, ...s.get].map((x) => x.token)))];
  const text = dayFile(
    { day, fillers: [...fillers], settlementTxs, listed: hashes.length, read: rows.length, hashes: rows.map((r) => r.hash) },
    swaps, usdAt, { decimals: tokens.flatMap((t) => (dec(t) == null ? [] : [[t, dec(t)]])), prices: [...prices] },
  );
  const parsed = parseDayFile(text, day);
  if (parsed.problems.length) throw new Error(`the day file does not hold together: ${parsed.problems.join('; ')}`);
  return { text, fillersDoc, report: { day, census: hashes.length, read: rows.length, swaps: parsed.head.swaps, fastnear: { ...io.stats } } };
}

async function main() {
  const now = new Date();
  const day = process.argv[2] ?? defaultDay(now);
  const dir = process.env.CHAIN_DIR ?? 'data/chain';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('usage: node pipeline/chain_day.mjs [YYYY-MM-DD]');
  if (!isOver(day, now)) throw new Error(`${day} is not over yet (a day freezes ${SETTLE_HOURS} hours after it ends)`);
  const file = join(dir, `${day}.jsonl`);
  if (existsSync(file)) { console.log(`${day} is already frozen, nothing to do`); return; }
  mkdirSync(dir, { recursive: true });
  const fillersPath = join(dir, 'fillers.json');
  const fillersDoc = existsSync(fillersPath) ? JSON.parse(readFileSync(fillersPath, 'utf8')) : null;

  const t0 = Date.now();
  const io = chain({ gapMs: Number(process.env.GAP_MS ?? 1000) });
  const r = await runDay({ day, io, fillersDoc, discover: process.env.DISCOVER === '1' });
  writeFileSync(fillersPath, JSON.stringify(r.fillersDoc, null, 1) + '\n');
  writeFileSync(file, r.text, { flag: 'wx' });
  const minutes = Math.round((Date.now() - t0) / 600) / 100;
  const summary = `## Chain day ${day}\n- Frozen ${file}: ${r.report.swaps.diff} token_diff swaps, ${r.report.swaps.transfer} transfer swaps\n- Read ${r.report.read} of ${r.report.census} census transactions in ${minutes} min; FastNEAR calls ${io.stats.calls}, 429s ${io.stats.r429}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((e) => { console.error(`NOT FROZEN: ${e.message}`); process.exitCode = 1; });
}
