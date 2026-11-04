// attest:check <day>: hash data/chain/<day>.jsonl and compare it with the testnet contract.
// Read-only, no key. Contract id and RPC come from contract/deployment.json (or env).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callView } from '../lib/near_view.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// "Could not check" gets its own exit code, so a script can't read it as a mismatch.
export const EXIT = { match: 0, mismatch: 1, 'not-anchored': 1, error: 2 };

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function compare(localHash, record) {
  if (!record) return 'not-anchored';
  return record.archive_sha256 === localHash ? 'match' : 'mismatch';
}

export const viewGet = (day, target) => callView('get', { day }, target);

export async function checkDay(day, { quotesDir, ...rpc }) {
  const local = sha256Hex(await readFile(join(quotesDir, `${day}.jsonl`)));
  const record = await viewGet(day, rpc);
  return { status: compare(local, record), local, record };
}

async function readDeployment() {
  try {
    return JSON.parse(await readFile(join(ROOT, 'contract', 'deployment.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function main() {
  const day = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) {
    console.error('usage: npm run attest:check -- YYYY-MM-DD');
    return EXIT.error;
  }
  const deployment = await readDeployment();
  const contractId = process.env.NEAR_ATTEST_CONTRACT ?? deployment.contractId;
  const rpcUrl = process.env.NEAR_RPC_URL ?? deployment.rpcUrl;
  if (!contractId || !rpcUrl) {
    console.error('COULD NOT CHECK: no contract deployed yet (contract/deployment.json is missing)');
    return EXIT.error;
  }
  const quotesDir = process.env.CHAIN_DIR ?? join(ROOT, 'data', 'chain');
  const { status, local, record } = await checkDay(day, { quotesDir, rpcUrl, contractId });
  console.log(`day      ${day}`);
  console.log(`contract ${contractId}`);
  console.log(`file     ${local}`);
  console.log(`on chain ${record?.archive_sha256 ?? '(no record)'}`);
  console.log({ match: 'MATCH', mismatch: 'MISMATCH', 'not-anchored': 'NOT ANCHORED' }[status]);
  return EXIT[status];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main().catch((err) => {
    console.error(`COULD NOT CHECK: ${err.message}`);
    return EXIT.error;
  });
}
