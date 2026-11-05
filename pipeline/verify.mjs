// npm run verify (U7, FR-14): recomputes each published file from the snapshot and labels in this repo, and diffs it against the committed copy.
// No network, no key. Set PUBLISHED_DIR to check another copy of data/published (the tests do).
// Source data that cannot be recomputed here (prices, supply, DefiLlama, chain balances) is listed as "input" and used as given.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const pub = process.env.PUBLISHED_DIR ?? 'data/published';
const TOL = 1e-9;

// Each file is rebuilt by the script that wrote it. chain_days.json comes from the frozen day files in data/chain (T2), which build_chain_days checks
// for consistency first; fee_trace.json from the last 7 of them (T4). elasticity and token_board come back as T5 and T6 rebuild them.
const checks = [
  { file: 'fee_trace.json', script: 'pipeline/build_fee_trace.mjs' },
  { file: 'thesis.json', script: 'pipeline/build_thesis.mjs' },
  { file: 'reconciliation.json', script: 'pipeline/build_reconciliation.mjs' },
  { file: 'chain_days.json', script: 'pipeline/build_chain_days.mjs' },
];
const inputs = ['model_inputs.json', 'fee_account.json'];

// Every number and string in a file, by path.
function leaves(v, path = '', out = new Map()) {
  if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) leaves(x, `${path}${Array.isArray(v) ? `[${k}]` : `.${k}`}`, out);
  else out.set(path, v);
  return out;
}
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);

export function diff(published, recomputed) {
  const a = leaves(published), b = leaves(recomputed), bad = [];
  for (const [p, v] of a) if (!b.has(p) || !same(v, b.get(p))) bad.push({ path: p, published: v, recomputed: b.has(p) ? b.get(p) : '(missing)' });
  for (const [p, v] of b) if (!a.has(p)) bad.push({ path: p, published: '(missing)', recomputed: v });
  return { checked: a.size, bad };
}

async function run() {
  const tmp = mkdtempSync(join(tmpdir(), 'verify-'));
  let bad = 0, total = 0;
  try {
    for (const c of checks) {
      const published = JSON.parse(readFileSync(`${pub}/${c.file}`, 'utf8'));
      const out = join(tmp, c.file);
      const env = { ...process.env, OUT: out, PUBLISHED_DIR: pub };
      const r = spawnSync(process.execPath, [c.script], { env, encoding: 'utf8' });
      if (r.status !== 0) { console.log(`FAIL ${c.file}: ${c.script} exited ${r.status}\n${(r.stderr || r.stdout).split('\n').slice(0, 5).join('\n')}`); bad++; continue; }
      const d = diff(published, JSON.parse(readFileSync(out, 'utf8')));
      total += d.checked;
      if (d.bad.length === 0) console.log(`OK   ${c.file}: ${d.checked} values match (${c.script})`);
      else {
        bad += d.bad.length;
        console.log(`DIFF ${c.file}: ${d.bad.length} of ${d.checked} values differ`);
        for (const x of d.bad.slice(0, 20)) console.log(`     ${x.path}: published ${JSON.stringify(x.published)}, recomputed ${JSON.stringify(x.recomputed)}`);
      }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const f of inputs) console.log(`INPUT ${f}: source data, used as given`);
  console.log(`${total} values compared.`);
  console.log(bad === 0 ? 'ALL OK' : `NOT OK: ${bad} problem${bad === 1 ? '' : 's'}`);
  process.exitCode = bad === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await run();
