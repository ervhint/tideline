// T6b (PREREG.md amendment A2, rule 8): one finished UTC day of transfers to and from the Confidential Intents treasury -> data/treasury/<day>.jsonl.
// Keyless public reads only (FastNEAR, NEAR RPC, DefiLlama). chain_day.mjs writes the file for new days from its own read; this script is the backfill,
// and reads the treasury's transactions only. A day needs its frozen chain file, whose filler list it uses. A day that can't be read is a gap.
// Usage: node pipeline/treasury_day.mjs YYYY-MM-DD   env CHAIN_DIR, TREASURY_DIR (default data/treasury), GAP_MS (FastNEAR pacing, default 1000)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chain } from './chain_io.mjs';
import { usdOf, transfersOfTx } from '../analysis/chain_swaps.mjs';
import { MIN_READ_SHARE } from '../analysis/chain_day.mjs';
import { TREASURY, treasuryFile, treasuryTransfers, parseTreasuryFile } from '../analysis/treasury.mjs';

// rows: [{ hash, ts, transfers }]. Prices the treasury transfers and builds the file text. Used by this script and by chain_day.mjs.
export async function treasuryText({ day, rows, fillers, readShare, io }) {
  const transfers = treasuryTransfers(rows);
  if (!transfers.length) throw new Error('no treasury transfers found');
  const { priceAt, dec, prices } = await io.priceBook(transfers.map((t) => ({ ts: t.ts, token: t.token })));
  const usdAt = (ts, side) => usdOf(side, priceAt(ts), dec);
  const tokens = [...new Set(transfers.map((t) => t.token))];
  const hashes = rows.filter((r) => r.transfers.some((t) => t.from === TREASURY || t.to === TREASURY)).map((r) => r.hash);
  const text = treasuryFile({ day, fillers, readShare, hashes }, transfers, usdAt, { decimals: tokens.flatMap((t) => (dec(t) == null ? [] : [[t, dec(t)]])), prices: [...prices] });
  const parsed = parseTreasuryFile(text, day);
  if (parsed.problems.length) throw new Error(`the treasury file does not hold together: ${parsed.problems.join('; ')}`);
  return text;
}

// Lists and reads the treasury's own transactions for one day. Throws with the reason when the day can't be read well enough.
export async function readTreasuryDay({ day, fillers, io, log = console.log }) {
  const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000;
  const from = await io.heightAt(dayStart), to = await io.heightAt(dayStart + 86_400);
  const listing = await io.listAccount({ account_id: TREASURY, is_event_log: true }, from, to);
  if (listing.capped) throw new Error('the treasury listing was cut short');
  const hashes = [...listing.txs.keys()].sort();
  log(`${day}: ${hashes.length} treasury transactions, blocks ${from} to ${to}`);
  const rows = [], seen = new Set();
  for (let i = 0; i < hashes.length; i += 20) {
    // As in chain_day.mjs: only listed transactions count, each once.
    for (const x of await io.readTxs(hashes.slice(i, i + 20))) {
      const h = x.transaction?.hash;
      if (!listing.txs.has(h) || seen.has(h)) continue;
      seen.add(h);
      rows.push({ hash: h, ts: listing.txs.get(h).ts, transfers: transfersOfTx(x).filter((t) => t.from === TREASURY || t.to === TREASURY) });
    }
    if ((i / 20) % 250 === 249) log(`${day}: read ${rows.length} of ${hashes.length}`);
  }
  const readShare = hashes.length ? rows.length / hashes.length : 0;
  if (readShare < MIN_READ_SHARE) throw new Error(`only ${rows.length} of ${hashes.length} treasury transactions could be read`);
  return treasuryText({ day, rows, fillers, readShare, io });
}

async function main() {
  const day = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error('usage: node pipeline/treasury_day.mjs YYYY-MM-DD');
  const dir = process.env.TREASURY_DIR ?? 'data/treasury', chainDir = process.env.CHAIN_DIR ?? 'data/chain';
  const file = join(dir, `${day}.jsonl`), chainFile = join(chainDir, `${day}.jsonl`);
  if (existsSync(file)) { console.log(`${day} is already read, nothing to do`); return; }
  if (!existsSync(chainFile)) throw new Error(`${chainFile} is missing, so the day has no filler list`);
  const { fillers } = JSON.parse(readFileSync(chainFile, 'utf8').split('\n', 1)[0]);
  const t0 = Date.now();
  const io = chain({ gapMs: Number(process.env.GAP_MS ?? 1000) });
  const text = await readTreasuryDay({ day, fillers, io });
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
  const summary = `## Treasury day ${day}\n- ${file} in ${Math.round((Date.now() - t0) / 600) / 100} min; FastNEAR calls ${io.stats.calls}, 429s ${io.stats.r429}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((e) => { console.error(`NOT READ: ${e.message}`); process.exitCode = 1; });
}
