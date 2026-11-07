// T2: the daily chain snapshot. Reads one finished UTC day of intents.near from FastNEAR and NEAR RPC, prices it from DefiLlama,
// and freezes it as data/chain/<day>.jsonl (file format: analysis/chain_day.mjs). Keyless public reads only (AGENTS.md data rule).
//
//   1. Fillers: data/chain/fillers.json lists the solvers and the transfer hub. It is carried forward and only grows. Once a week
//      (or when the file is missing) a seeded sample of the day's settlement transactions finds new ones.
//   2. Census: every transaction of the day whose dip4 logs name a filler, read in full.
//   3. Swaps: token_diff swaps with a referral, plus transfer swaps through the fillers; priced hourly from DefiLlama.
//   4. Freeze: written once and never changed. A day that cannot be read well enough (a capped listing, under 99% read,
//      no swaps) is not written: it stays a gap, shown and never filled in.
//   5. Treasury: the census already holds every treasury transaction, so data/treasury/<day>.jsonl (PREREG A2 rule 8) comes from the same
//      read at no extra FastNEAR cost. If that fails the chain day still freezes; pipeline/treasury_day.mjs can read it later.
//
// Usage: node pipeline/chain_day.mjs [YYYY-MM-DD]   (default: yesterday UTC; it is over 2 hours after midnight, so the 03:17 schedule is safe)
//   env CHAIN_DIR (default data/chain), TREASURY_DIR (default data/treasury), GAP_MS (FastNEAR pacing, default 1000), DISCOVER=1 (look for new fillers today)
//   STAGE=start|read|finish runs one stage for chain-day.yml, with WORK (the folder between stages) and PART (0 to PARTS - 1). No STAGE runs them all here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chain } from './chain_io.mjs';
import { usdOf, sampleHashes } from '../analysis/chain_swaps.mjs';
import { compactTx, fillersOfSample, mergeFillers, swapsOfDay, dayFile, parseDayFile, MIN_READ_SHARE } from '../analysis/chain_day.mjs';
import { treasuryText } from './treasury_day.mjs';

const DAY_MS = 86_400_000;
// A run that starts just after midnight must not freeze a day whose last transactions are still being indexed.
export const SETTLE_HOURS = 2;
export const REDISCOVER_DAYS = 7;
export const DISCOVER_SAMPLE = 2000;
// chain-day.yml reads a day in this many block ranges on separate runners; its matrix lists the same number. A listing stops at 300k transactions
// an account and a runner reads about 325k before its time cap. Parts are equal in blocks, not in traffic: on 5 Nov the busiest held 40% of the day,
// so this holds a day of about 800k. The census was 204k on 5 Nov.
export const PARTS = 4;

export const defaultDay = (now) => new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
export const isOver = (day, now) => Date.parse(`${day}T00:00:00Z`) + DAY_MS + SETTLE_HOURS * 3_600_000 <= now.getTime();
export const needsDiscovery = (doc, day, force = false) => force || !doc || Date.parse(`${day}T00:00:00Z`) - Date.parse(`${doc.updated}T00:00:00Z`) >= REDISCOVER_DAYS * DAY_MS;

// The blocks of one UTC day.
export async function heightsOf(day, io) {
  const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000;
  return { from: await io.heightAt(dayStart), to: await io.heightAt(dayStart + 86_400) };
}

// Part i of n of a block range. The parts touch and never overlap, so each transaction falls in exactly one.
export const sliceOf = (from, to, part, parts) => [from + Math.floor(((to - from) * part) / parts), from + Math.floor(((to - from) * (part + 1)) / parts)];

// Stage 1. Once a week a seeded sample of the day's settlement transactions adds new fillers. A capped listing still gives a sample, so it does not
// stop the day: the list only grows, and settlementTxs stays null because the true count is not known.
export async function findFillers({ day, io, fillersDoc, from, to, discover = false, log = console.log }) {
  let settlementTxs = null;
  if (needsDiscovery(fillersDoc, day, discover)) {
    const settlement = await io.listAccount({ account_id: 'intents.near', is_signer: true }, from, to);
    if (settlement.capped) log(`${day}: the settlement listing was cut short at ${settlement.txs.size}, so the filler sample covers the start of the day`);
    else settlementTxs = settlement.txs.size;
    const sample = await io.readTxs(sampleHashes([...settlement.txs.keys()], DISCOVER_SAMPLE, `${day}:fillers`));
    const found = fillersOfSample(sample);
    fillersDoc = mergeFillers(fillersDoc, found, day);
    log(`${day}: sample of ${sample.length} found ${found.solvers.length} solvers and ${found.hubs.length} hubs; ${fillersDoc.fillers.length} fillers in all`);
  }
  if (!fillersDoc?.fillers.length) throw new Error('no fillers to read');
  return { fillersDoc, settlementTxs };
}

// Stage 2. Every transaction in these blocks whose dip4 logs name a filler, read in full. Returns how many were listed and the compact rows.
export async function readCensus({ day, io, fillers, from, to, log = console.log }) {
  const census = new Map(); // hash -> ts (s)
  for (const a of fillers) {
    const l = await io.listAccount({ account_id: a, is_event_log: true }, from, to);
    if (l.capped) throw new Error(`the listing for ${a} was cut short`);
    for (const [h, x] of l.txs) census.set(h, x.ts);
  }
  log(`${day}: ${census.size} census transactions from ${fillers.size} fillers, blocks ${from} to ${to}`);

  const hashes = [...census.keys()].sort();
  const rows = [], seen = new Set();
  for (let i = 0; i < hashes.length; i += 20) {
    // FastNEAR can return a transaction twice in one batch, or one that was not asked for (T3: 4 days read 1 to 6 more than listed).
    // Only listed transactions count, each once, so no swap is counted twice.
    for (const x of await io.readTxs(hashes.slice(i, i + 20))) {
      const h = x.transaction?.hash;
      if (!census.has(h) || seen.has(h)) continue;
      seen.add(h);
      rows.push(compactTx(x, census.get(h), fillers));
    }
    if ((i / 20) % 250 === 249) log(`${day}: read ${rows.length} of ${hashes.length}`);
  }
  // Checked per part too: a hole of 1% of the day must not all sit in one block range.
  if (hashes.length && rows.length / hashes.length < MIN_READ_SHARE) throw new Error(`only ${rows.length} of ${hashes.length} census transactions could be read`);
  return { listed: hashes.length, rows };
}

// Stage 3. All the day's rows to a frozen file. Rows are put in hash order, so the file does not depend on how the read was split.
export async function finishDay({ day, io, fillersDoc, settlementTxs, listed, rows, log = console.log }) {
  const fillers = new Set(fillersDoc.fillers.map((f) => f.account));
  rows = [...rows].sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0));
  const readShare = listed ? rows.length / listed : 0;
  if (readShare < MIN_READ_SHARE) throw new Error(`only ${rows.length} of ${listed} census transactions could be read`);

  const swaps = swapsOfDay(rows, fillers);
  if (!swaps.length) throw new Error('no swaps found, so the day is not frozen');
  const { priceAt, dec, prices } = await io.priceBook(swaps.flatMap((s) => [...s.give, ...s.get].map((x) => ({ ts: s.ts, token: x.token }))));
  const usdAt = (ts, side) => usdOf(side, priceAt(ts), dec);
  const tokens = [...new Set(swaps.flatMap((s) => [...s.give, ...s.get].map((x) => x.token)))];
  const text = dayFile(
    { day, fillers: [...fillers], settlementTxs, listed, read: rows.length, hashes: rows.map((r) => r.hash) },
    swaps, usdAt, { decimals: tokens.flatMap((t) => (dec(t) == null ? [] : [[t, dec(t)]])), prices: [...prices] },
  );
  const parsed = parseDayFile(text, day);
  if (parsed.problems.length) throw new Error(`the day file does not hold together: ${parsed.problems.join('; ')}`);
  // Called after the chain file is on disk, so a slow price read can't cost the frozen day. Null when it fails: a treasury gap, not a chain gap.
  const treasury = () => treasuryText({ day, rows, fillers: [...fillers], readShare, io }).catch((e) => { log(`${day}: treasury file not written: ${e.message}`); return null; });
  return { text, treasury, fillersDoc, report: { day, census: listed, read: rows.length, swaps: parsed.head.swaps, fastnear: { ...io.stats } } };
}

// All three stages in one run. io: the object chain() returns (or a stand-in with the same calls). Throws with the reason the day is not frozen.
export async function runDay({ day, io, fillersDoc, discover = false, log = console.log }) {
  const { from, to } = await heightsOf(day, io);
  log(`${day}: blocks ${from} to ${to}`);
  const f = await findFillers({ day, io, fillersDoc, from, to, discover, log });
  const { listed, rows } = await readCensus({ day, io, fillers: new Set(f.fillersDoc.fillers.map((x) => x.account)), from, to, log });
  return finishDay({ day, io, ...f, listed, rows, log });
}

// A part's rows between the read jobs and the finish job. One row per line; raw amounts are BigInt, which JSON can't hold.
export const partText = ({ listed, rows }) => [JSON.stringify({ listed }), ...rows.map((r) => JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? String(v) : v)))].join('\n') + '\n';
export function parsePart(text) {
  const [head, ...lines] = text.split('\n').filter(Boolean);
  return { listed: JSON.parse(head).listed, rows: lines.map((l) => JSON.parse(l, (k, v) => (k === 'raw' ? BigInt(v) : v))) };
}

// Joins the parts. A missing part throws: a day is never frozen from some of its blocks.
export function joinParts(texts, parts = PARTS) {
  if (texts.length !== parts || texts.some((t) => t == null)) throw new Error(`only ${texts.filter((t) => t != null).length} of ${parts} read parts arrived`);
  const all = texts.map(parsePart);
  return { listed: all.reduce((t, p) => t + p.listed, 0), rows: all.flatMap((p) => p.rows) };
}

const dirs = () => ({ dir: process.env.CHAIN_DIR ?? 'data/chain', tdir: process.env.TREASURY_DIR ?? 'data/treasury' });
const work = (name) => join(process.env.WORK ?? 'chain-work', name);
const fastnear = () => chain({ gapMs: Number(process.env.GAP_MS ?? 1000) });
const say = (text) => { console.log(text); if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, text, { flag: 'a' }); };

// The day to freeze, or null when it is frozen already. Throws on a bad or unfinished day.
function dayToFreeze(now) {
  const day = process.argv[2] || defaultDay(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('usage: node pipeline/chain_day.mjs [YYYY-MM-DD]');
  if (!isOver(day, now)) throw new Error(`${day} is not over yet (a day freezes ${SETTLE_HOURS} hours after it ends)`);
  if (existsSync(join(dirs().dir, `${day}.jsonl`))) { console.log(`${day} is already frozen, nothing to do`); return null; }
  return day;
}
const readFillers = () => { const p = join(dirs().dir, 'fillers.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

async function writeDay(day, r, io, t0) {
  const { dir, tdir } = dirs();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`), tfile = join(tdir, `${day}.jsonl`);
  writeFileSync(join(dir, 'fillers.json'), JSON.stringify(r.fillersDoc, null, 1) + '\n');
  writeFileSync(file, r.text, { flag: 'wx' });
  const treasury = existsSync(tfile) ? 'already read' : await r.treasury();
  if (treasury && treasury !== 'already read') {
    mkdirSync(tdir, { recursive: true });
    writeFileSync(tfile, treasury);
  }
  const minutes = Math.round((Date.now() - t0) / 600) / 100;
  say(`## Chain day ${day}\n- Frozen ${file}: ${r.report.swaps.diff} token_diff swaps, ${r.report.swaps.transfer} transfer swaps\n- Treasury file ${treasury === 'already read' ? treasury : treasury ? 'written' : 'NOT written, a gap until pipeline/treasury_day.mjs reads it'}\n- Read ${r.report.read} of ${r.report.census} census transactions; this step ${minutes} min, FastNEAR calls ${io.stats.calls}, 429s ${io.stats.r429}\n`);
}

// chain-day.yml runs the stages on separate runners: start once, read once per part, finish once. Their files go through WORK.
const STAGES = {
  async start() {
    const output = (line) => { if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, line + '\n', { flag: 'a' }); };
    const day = dayToFreeze(new Date());
    if (!day) { output('todo=false'); return; }
    const io = fastnear();
    const { from, to } = await heightsOf(day, io);
    const f = await findFillers({ day, io, fillersDoc: readFillers(), from, to, discover: process.env.DISCOVER === '1' });
    mkdirSync(work(''), { recursive: true });
    writeFileSync(work('start.json'), JSON.stringify({ day, from, to, ...f }));
    output('todo=true');
  },
  async read() {
    const part = Number(process.env.PART);
    if (!Number.isInteger(part) || part < 0 || part >= PARTS) throw new Error(`PART must be 0 to ${PARTS - 1}`);
    const { day, from, to, fillersDoc } = JSON.parse(readFileSync(work('start.json'), 'utf8'));
    const [a, b] = sliceOf(from, to, part, PARTS);
    const t0 = Date.now(), io = fastnear();
    const p = await readCensus({ day, io, fillers: new Set(fillersDoc.fillers.map((x) => x.account)), from: a, to: b });
    writeFileSync(work(`part-${part}.jsonl`), partText(p));
    say(`## Part ${part + 1} of ${PARTS}, ${day}\n- Read ${p.rows.length} of ${p.listed} in ${Math.round((Date.now() - t0) / 600) / 100} min; FastNEAR calls ${io.stats.calls}, 429s ${io.stats.r429}\n`);
  },
  async finish() {
    const start = JSON.parse(readFileSync(work('start.json'), 'utf8'));
    const { day, fillersDoc, settlementTxs } = start;
    const texts = Array.from({ length: PARTS }, (_, i) => (existsSync(work(`part-${i}.jsonl`)) ? readFileSync(work(`part-${i}.jsonl`), 'utf8') : null));
    const t0 = Date.now(), io = fastnear();
    await writeDay(day, await finishDay({ day, io, fillersDoc, settlementTxs, ...joinParts(texts) }), io, t0);
  },
};

async function main() {
  if (process.env.STAGE) {
    if (!STAGES[process.env.STAGE]) throw new Error(`unknown STAGE ${process.env.STAGE}`);
    return STAGES[process.env.STAGE]();
  }
  const day = dayToFreeze(new Date());
  if (!day) return;
  const t0 = Date.now(), io = fastnear();
  await writeDay(day, await runDay({ day, io, fillersDoc: readFillers(), discover: process.env.DISCOVER === '1' }), io, t0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((e) => { console.error(`NOT FROZEN: ${e.message}`); process.exitCode = 1; });
}
