// Writes data/published/chain_days.json (T2): one summary line per frozen chain day, rebuilt from data/chain/*.jsonl alone (no network).
// Fails when a day file does not hold together, so `npm run verify` catches an edited or damaged day.
// Usage: node pipeline/build_chain_days.mjs   (OUT overrides the output path, CHAIN_DIR the day files)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDayFile, summarizeDays } from '../analysis/chain_day.mjs';

const OUT = process.env.OUT ?? 'data/published/chain_days.json';
const DIR = process.env.CHAIN_DIR ?? 'data/chain';

export const dayFiles = (dir = DIR) => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();

const days = [];
const problems = [];
for (const f of dayFiles()) {
  const p = parseDayFile(readFileSync(`${DIR}/${f}`, 'utf8'), f.slice(0, 10));
  if (p.problems.length) problems.push(...p.problems.map((x) => `${f}: ${x}`));
  else days.push(p);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const doc = {
  source: 'intents.near census of solvers and the Confidential Intents treasury (FastNEAR, NEAR RPC), priced from DefiLlama',
  query: 'analysis/chain_day.mjs summarizeDays → data/chain/*.jsonl',
  ...summarizeDays(days),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`wrote ${OUT}: ${doc.days.length} frozen day${doc.days.length === 1 ? '' : 's'}${doc.gaps.length ? `, ${doc.gaps.length} gap day${doc.gaps.length === 1 ? '' : 's'}` : ''}`);
