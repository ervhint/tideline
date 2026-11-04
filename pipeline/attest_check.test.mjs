import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex, compare, viewGet, checkDay, EXIT } from './attest_check.mjs';

const DAY = '2026-11-01';

const rpcReturning = (value) => async () => ({
  status: 200,
  json: async () => ({ result: { result: [...Buffer.from(JSON.stringify(value))] } }),
});

async function checkArchive(bytes, record) {
  const quotesDir = await mkdtemp(join(tmpdir(), 'attest-'));
  try {
    await writeFile(join(quotesDir, `${DAY}.jsonl`), bytes);
    return await checkDay(DAY, { quotesDir, rpcUrl: 'http://x', contractId: 'c', fetchFn: rpcReturning(record) });
  } finally {
    await rm(quotesDir, { recursive: true, force: true });
  }
}

test('sha256Hex matches a known value', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('compare names all three outcomes', () => {
  assert.equal(compare('aa', { archive_sha256: 'aa' }), 'match');
  assert.equal(compare('aa', { archive_sha256: 'bb' }), 'mismatch');
  assert.equal(compare('aa', null), 'not-anchored');
});

test('T-1.3: the same file matches and one changed byte does not', async () => {
  const original = Buffer.from('{"quote":1}\n{"quote":2}\n');
  const record = { archive_sha256: sha256Hex(original), readings: '', block_timestamp: '1' };
  assert.equal((await checkArchive(original, record)).status, 'match');

  const changed = Buffer.from(original);
  changed[3] ^= 1;
  assert.equal((await checkArchive(changed, record)).status, 'mismatch');
});

test('a line-ending rewrite counts as a change', async () => {
  const record = { archive_sha256: sha256Hex(Buffer.from('a\nb\n')) };
  assert.equal((await checkArchive(Buffer.from('a\r\nb\r\n'), record)).status, 'mismatch');
});

test('a day with no record reads as not anchored and exits non-zero', async () => {
  const out = await checkArchive(Buffer.from('a\n'), null);
  assert.equal(out.status, 'not-anchored');
  assert.notEqual(EXIT[out.status], 0);
});

test('viewGet asks for the right method and day', async () => {
  let sent;
  const reply = rpcReturning({ archive_sha256: 'aa' });
  const fetchFn = async (url, init) => { sent = JSON.parse(init.body); return reply(url, init); };
  const record = await viewGet(DAY, { rpcUrl: 'http://x', contractId: 'c.testnet', fetchFn });
  assert.equal(record.archive_sha256, 'aa');
  assert.equal(sent.params.account_id, 'c.testnet');
  assert.equal(sent.params.method_name, 'get');
  assert.equal(JSON.parse(Buffer.from(sent.params.args_base64, 'base64')).day, DAY);
});

test('RPC failures throw, so they can never read as a match', async () => {
  const opts = { rpcUrl: 'x', contractId: 'c' };
  const topLevel = async () => ({ status: 500, json: async () => ({ error: { message: 'boom' } }) });
  await assert.rejects(viewGet(DAY, { ...opts, fetchFn: topLevel }), /RPC error/);
  const inResult = async () => ({ status: 200, json: async () => ({ result: { error: 'no such method' } }) });
  await assert.rejects(viewGet(DAY, { ...opts, fetchFn: inResult }), /RPC error/);
  const empty = async () => ({ status: 502, json: async () => ({}) });
  await assert.rejects(viewGet(DAY, { ...opts, fetchFn: empty }), /Unexpected RPC reply/);
});
