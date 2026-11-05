// Token names for the coverage board (FR-21): the symbol from each nep141 token's own ft_metadata on NEAR mainnet (keyless RPC).
// Reads the route tokens of the last 30 frozen chain days and adds the ones data/labels/tokens.json does not have yet. It only grows.
// HOT nep245 tokens have no ft_metadata; they keep their shortened id. Network: run by the refresh job in Actions, not by verify.
// Usage: node pipeline/token_names.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseDayFile } from '../analysis/chain_day.mjs';
import { chain } from './chain_io.mjs';

const OUT = 'data/labels/tokens.json';
const DIR = process.env.CHAIN_DIR ?? 'data/chain';
const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().slice(-30);
const ids = new Set(files.flatMap((f) => parseDayFile(readFileSync(`${DIR}/${f}`, 'utf8')).routes.flatMap((r) => [r.from, r.to])));
const doc = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { tokens: {} };
const { rpc } = chain();

let added = 0, failed = 0;
for (const id of [...ids].sort()) {
  if (doc.tokens[id] || !id.startsWith('nep141:')) continue;
  try {
    const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: id.slice(7), method_name: 'ft_metadata', args_base64: '' });
    const m = JSON.parse(Buffer.from(r.result).toString());
    if (typeof m.symbol === 'string' && m.symbol.trim()) { doc.tokens[id] = { symbol: m.symbol.trim().slice(0, 16) }; added++; }
  } catch (e) {
    failed++;
    console.log(`ft_metadata failed for ${id}: ${e.message.slice(0, 120)}`);
  }
}
const sorted = Object.fromEntries(Object.entries(doc.tokens).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
writeFileSync(OUT, JSON.stringify({
  rule: 'symbol from the token contract\'s own ft_metadata on NEAR mainnet; written by pipeline/token_names.mjs, only grows',
  tokens: sorted,
}, null, 1) + '\n');
console.log(`${ids.size} route tokens, ${added} names added, ${failed} failed, ${Object.keys(sorted).length} known -> ${OUT}`);
