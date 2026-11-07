// Writes data/published/confidential.json (T6b, PREREG.md amendment A2 rules 1, 7 and 8) from data/chain/*.jsonl and data/treasury/*.jsonl alone (no network).
// A side measure: it sets no reading. Fails when a file does not hold together, so `npm run verify` catches a damaged one.
// Usage: node pipeline/build_confidential.mjs   (OUT, CHAIN_DIR and TREASURY_DIR override the paths)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDayFile } from '../analysis/chain_day.mjs';
import { confidentialDoc, parseTreasuryFile } from '../analysis/treasury.mjs';

const OUT = process.env.OUT ?? 'data/published/confidential.json';
const CHAIN = process.env.CHAIN_DIR ?? 'data/chain';
const TREASURY = process.env.TREASURY_DIR ?? 'data/treasury';
const isDay = (f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f);

function load(dir, parse) {
  return (existsSync(dir) ? readdirSync(dir) : []).filter(isDay).sort().map((f) => {
    const p = parse(readFileSync(`${dir}/${f}`, 'utf8'), f.slice(0, 10));
    if (p.problems.length) throw new Error(`${dir}/${f}: ${p.problems.join('; ')}`);
    return p;
  });
}

const days = load(CHAIN, parseDayFile);
const files = new Map(load(TREASURY, parseTreasuryFile).map((p) => [p.head.day, p]));
const doc = {
  prereg: 'PREREG.md amendment A2, rules 1, 7 and 8',
  source: 'intents.near dip4 transfers to and from the Confidential Intents treasury (FastNEAR), priced from DefiLlama; frozen chain days for the rest. Not anchored on chain; sets no reading',
  query: 'analysis/treasury.mjs confidentialDoc → data/chain/*.jsonl, data/treasury/*.jsonl',
  ...confidentialDoc(days, files),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`wrote ${OUT}: ${doc.perDay.length} chain days, ${files.size} treasury files; treasury share last 7 days ${(doc.last7.treasuryShare * 100).toFixed(1)}%, last 30 ${(doc.last30.treasuryShare * 100).toFixed(1)}%`);
