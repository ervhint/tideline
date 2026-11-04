// Reads the intents.near protocol fee and its collector from the chain and saves them to data/snapshot/protocol_fee.json (FR-05).
// fee() is in pips: 1 pip = 0.0001% = 0.01 bps (near/intents crates/primitives/fees). It is read now and at a few past blocks, to show it did not move.
// Usage: node pipeline/protocol_fee.mjs   (OUT overrides the output path). No key.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { retry } from './http.mjs';

const OUT = process.env.OUT ?? 'data/snapshot/protocol_fee.json';
const RPC = 'https://archival-rpc.mainnet.fastnear.com';
const PAST = [182_560_000, 192_000_000, 205_000_000, 215_000_000];

const rpc = (method, params) => retry(`NEAR RPC ${method}`, async () => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(30_000) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160));
  return j.result;
});
const view = async (method, at) => JSON.parse(Buffer.from((await rpc('query', { request_type: 'call_function', account_id: 'intents.near', method_name: method, args_base64: 'e30=', ...at })).result).toString());
const timeOf = async (height) => new Date(Number(BigInt((await rpc('block', { block_id: height })).header.timestamp) / 1_000_000n)).toISOString();

const head = await rpc('block', { finality: 'final' });
const now = { block: head.header.height, at: new Date(Number(BigInt(head.header.timestamp) / 1_000_000n)).toISOString(), feePips: await view('fee', { block_id: head.header.height }) };
const past = [];
for (const h of PAST) past.push({ block: h, at: await timeOf(h), feePips: await view('fee', { block_id: h }) });

const doc = {
  source: 'intents.near view calls fee() and fee_collector(), FastNEAR archival RPC',
  unit: 'pips: 1,000,000 = 100%, so 1 pip = 0.01 bps',
  feePips: now.feePips,
  feeBps: now.feePips / 100,
  collector: await view('fee_collector', { block_id: now.block }),
  readAt: now,
  pastReadings: past,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`protocol fee ${doc.feePips} pip (${doc.feeBps} bps), collector ${doc.collector}; past: ${past.map((p) => `${p.at.slice(0, 10)} ${p.feePips}`).join(', ')} -> ${OUT}`);
