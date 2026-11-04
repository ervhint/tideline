// Writes data/published/token_board.json (FR-21): the coverage board over the last 30 frozen days of data/snapshot/tokens.
// Set OUT to write elsewhere (verify does).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { coverageBoard } from '../analysis/token_coverage.mjs';

const out = process.env.OUT ?? 'data/published/token_board.json';
const DAYS = 30;
const files = readdirSync('data/snapshot/tokens').filter((f) => f.endsWith('.csv.gz')).sort().slice(-DAYS);
const rows = files.flatMap((f) => gunzipSync(readFileSync(`data/snapshot/tokens/${f}`)).toString().split('\n').slice(1).filter(Boolean).map((l) => {
  const [day, from, to, swaps, usd] = l.split(',');
  return { day, from, to, swaps: +swaps, usd: +usd };
}));
const { tokens } = JSON.parse(readFileSync('data/labels/tokens.json', 'utf8'));
const board = coverageBoard(rows, tokens);
const result = {
  asOf: board.to, ...board,
  source: 'Explorer, 1Click only: swaps per route in data/snapshot/tokens; token names from the 1Click token list (data/labels/tokens.json)',
  query: 'coverageBoard in analysis/token_coverage.mjs, run by pipeline/build_token_board.mjs',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`${board.days} days, ${board.routes} routes: quoted ${(board.byStatus.quoted.share * 100).toFixed(1)}%, similar ${(board.byStatus.similar.share * 100).toFixed(1)}% -> ${out}`);
