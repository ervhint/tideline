// Writes data/published/token_board.json (FR-21): the coverage board over the last 30 frozen chain days (T6). No network.
// Token names come from data/labels/tokens.json (ft_metadata, written by pipeline/token_names.mjs); a token without one keeps its shortened id.
// Set OUT to write elsewhere (verify does), CHAIN_DIR to read other day files.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDayFile } from '../analysis/chain_day.mjs';
import { coverageBoard } from '../analysis/token_coverage.mjs';

const out = process.env.OUT ?? 'data/published/token_board.json';
const DIR = process.env.CHAIN_DIR ?? 'data/chain';
const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().slice(-30);
const days = files.map((f) => {
  const p = parseDayFile(readFileSync(`${DIR}/${f}`, 'utf8'), f.slice(0, 10));
  if (p.problems.length) throw new Error(`${f}: ${p.problems.join('; ')}`);
  return p;
});
const names = existsSync('data/labels/tokens.json') ? JSON.parse(readFileSync('data/labels/tokens.json', 'utf8')).tokens : {};
const board = coverageBoard(days, names);
const result = {
  ...board,
  source: 'intents.near route rows of the frozen chain days; prices and decimals stored in each day file; token names from ft_metadata (data/labels/tokens.json)',
  query: 'coverageBoard in analysis/token_coverage.mjs, run by pipeline/build_token_board.mjs',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
const s = board.byStatus;
console.log(`${board.days} days, ${board.routes} routes: both sides priced ${(s.both.swapShare * 100).toFixed(1)}% of swaps, one side ${(s.one.swapShare * 100).toFixed(1)}%, none ${(s.none.swapShare * 100).toFixed(1)}% -> ${out}`);
