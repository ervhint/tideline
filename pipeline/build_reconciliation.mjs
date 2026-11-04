// Writes data/published/reconciliation.json (U9, FR-18): our side of each figure that public sources disagree on, next to theirs.
// Files only, no network: data/published/{thesis,model_inputs}.json and data/snapshot/defillama_daily.json.
// Usage: node pipeline/build_reconciliation.mjs   (OUT overrides the output path, PUBLISHED_DIR the published copy it reads)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { reconcileRows } from '../lib/reconcile_view.ts';

const OUT = process.env.OUT ?? 'data/published/reconciliation.json';
const PUB = process.env.PUBLISHED_DIR ?? 'data/published';
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

const thesis = json(`${PUB}/thesis.json`);
const inputs = json(`${PUB}/model_inputs.json`);
const rows = reconcileRows({
  vstar: thesis.vstar,
  buybackShare: inputs.buyback?.shareOfRevenue ?? null,
  fees: json('data/snapshot/defillama_daily.json').days,
  volume: [], // DefiLlama daily volume is saved from T1 on
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ rows }, null, 1) + '\n');
console.log(`wrote ${OUT}: ${rows.length} rows`);
