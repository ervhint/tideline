// attest:send: writes every finished quote day the contract lacks. A record can never be
// changed, so it reads each one back and stops at the first surprise. Runs in GitHub Actions
// with the near CLI; --dry-run prints what it would send and needs no key.
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex, viewGet } from './attest_check.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_READINGS_BYTES = 256;
const CONFIRM_TRIES = 10;
const CONFIRM_WAIT_MS = 3_000;

// Days before this one were recorded late, so they carry the hash only: readings worked out
// now would look as if they had been known back then.
export const FIRST_DAY_WITH_READINGS = '2026-11-02';
// A sampler run started just before midnight commits to that day's file a few minutes after it.
export const SETTLE_HOURS = 2;

export function finishedDays(fileNames, now) {
  return fileNames
    .map((name) => /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)?.[1])
    .filter((day) => day && Date.parse(`${day}T00:00:00Z`) + (24 + SETTLE_HOURS) * 3_600_000 <= now.getTime())
    .sort();
}

// asOf stays in the string: until the hourly job exists, the readings can be older than the day.
export function readingsFor(day, thesis) {
  if (day < FIRST_DAY_WITH_READINGS) return '';
  const sides = thesis.readings.map((r) => `${r.id}=${r.side}`);
  const text = [...sides, `verdict=${thesis.verdict.verdict}`, `score=${thesis.verdict.score}`, `asOf=${thesis.asOf.slice(0, 10)}`].join(';');
  if (Buffer.byteLength(text) > MAX_READINGS_BYTES) throw new Error(`readings too long for ${day}: ${text}`);
  return text;
}

// view(day) reads the contract; send(args) writes it. Returns what happened to each day.
export async function sendPending(days, { hashOf, readingsOf, view, send, wait = () => {}, dryRun = false, log = console.log }) {
  const results = [];
  for (const day of days) {
    const archive_sha256 = await hashOf(day);
    const existing = await view(day);
    if (existing) {
      if (existing.archive_sha256 !== archive_sha256) {
        throw new Error(`${day}: file ${archive_sha256} differs from the record ${existing.archive_sha256}`);
      }
      log(`${day} already recorded, matches`);
      results.push({ day, status: 'already' });
      continue;
    }
    const args = { day, archive_sha256, readings: await readingsOf(day) };
    if (dryRun) {
      log(`${day} would send ${JSON.stringify(args)}`);
      results.push({ day, status: 'dry-run' });
      continue;
    }
    send(args);
    let record = null;
    for (let i = 0; i < CONFIRM_TRIES && !record; i++) {
      await wait();
      record = await view(day);
    }
    if (record?.archive_sha256 !== archive_sha256) throw new Error(`${day}: sent, but the contract shows ${JSON.stringify(record)}`);
    log(`${day} recorded ${archive_sha256}`);
    results.push({ day, status: 'sent' });
  }
  return results;
}

function nearSend(args, { contractId, privateKey }) {
  const { status, error } = spawnSync('near', [
    'contract', 'call-function', 'as-transaction', contractId, 'attest',
    'json-args', JSON.stringify(args),
    'prepaid-gas', '30 TGas',
    'attached-deposit', '0 NEAR',
    'sign-as', contractId,
    'network-config', 'testnet',
    'sign-with-plaintext-private-key', privateKey,
    'send',
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (error) throw error;
  if (status !== 0) throw new Error(`near exited with ${status} for ${args.day}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const deployment = JSON.parse(await readFile(join(ROOT, 'contract', 'deployment.json'), 'utf8'));
  const { contractId, rpcUrl, network } = deployment;
  if (network !== 'testnet') throw new Error(`refusing to send on ${network}`);
  const privateKey = process.env.NEAR_ATTEST_PRIVATE_KEY;
  if (!dryRun && !privateKey) throw new Error('NEAR_ATTEST_PRIVATE_KEY is not set');

  const quotesDir = process.env.QUOTES_DIR ?? join(ROOT, 'data', 'quotes');
  const days = finishedDays(await readdir(quotesDir), new Date());
  const results = await sendPending(days, {
    dryRun,
    hashOf: async (day) => sha256Hex(await readFile(join(quotesDir, `${day}.jsonl`))),
    readingsOf: async (day) => {
      if (day < FIRST_DAY_WITH_READINGS) return readingsFor(day);
      return readingsFor(day, JSON.parse(await readFile(join(ROOT, 'data', 'published', 'thesis.json'), 'utf8')));
    },
    view: (day) => viewGet(day, { rpcUrl, contractId }),
    send: (args) => nearSend(args, { contractId, privateKey }),
    wait: () => new Promise((done) => setTimeout(done, CONFIRM_WAIT_MS)),
  });
  console.log(`${results.length} finished days, ${results.filter((r) => r.status === 'sent').length} sent`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((err) => {
    console.error(`ATTEST FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
