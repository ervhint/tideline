import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTreasuryDay } from './treasury_day.mjs';
import { runDay } from './chain_day.mjs';
import { parseDayFile } from '../analysis/chain_day.mjs';
import { TREASURY, parseTreasuryFile } from '../analysis/treasury.mjs';

const log = (event, data) => `EVENT_JSON:${JSON.stringify({ standard: 'dip4', version: '0.4.3', event, data })}`;
const tx = (hash, ...logs) => ({ transaction: { hash }, receipts: [{ execution_outcome: { outcome: { logs } } }] });
const t = (from, to, token, raw) => log('transfer', [{ account_id: from, receiver_id: to, tokens: { [token]: raw } }]);
const USDC = 'nep141:usdc.near', WNEAR = 'nep141:wrap.near';

// u1 shields USDC and gets wNEAR back; the listed filler s1 moves USDC in and out; one transaction names no treasury transfer.
const TXS = new Map([
  tx('in1', t('u1', TREASURY, USDC, '100000000')),
  tx('out1', t(TREASURY, 'u1', WNEAR, '24000000000000000000000000')),
  tx('liq', t('s1', TREASURY, USDC, '500000000')),
  tx('other', t('u2', 'u3', USDC, '1')),
].map((x) => [x.transaction.hash, x]));
const ALL = [...TXS.keys()];

const fake = (over = {}) => ({
  stats: { calls: 0, r429: 0 },
  heightAt: async (ts) => ts,
  listAccount: async () => ({ capped: false, pages: 1, txs: new Map(ALL.map((h) => [h, { ts: 1000, isSigner: false }])) }),
  readTxs: async (hashes) => hashes.map((h) => TXS.get(h)),
  priceBook: async () => ({ priceAt: () => (token) => ({ [USDC]: 1, [WNEAR]: 4 })[token] ?? null, dec: (token) => ({ [USDC]: 6, [WNEAR]: 24 })[token] ?? null, calls: 1, prices: new Map([['0|near:x', 2]]) }),
  ...over,
});
const quiet = () => {};
const read = (io) => readTreasuryDay({ day: '2026-11-05', fillers: ['s1', TREASURY], io, log: quiet });

test('T6b: a day of treasury transactions becomes a file that parses clean, with fillers kept apart', async () => {
  const p = parseTreasuryFile(await read(fake()), '2026-11-05');
  assert.deepEqual(p.problems, []);
  assert.equal(p.head.census.transactions, 3);
  assert.equal(p.head.fillers, 2);
  const at = (dir, who) => p.flows.find((f) => f.dir === dir && f.who === who);
  assert.equal(at('in', 'other').usd, 100);
  assert.equal(at('in', 'filler').usd, 500);
  assert.equal(at('out', 'other').usd, 96);
});

test('T6b: it reads the treasury listing only', async () => {
  const seen = [];
  await read(fake({ listAccount: async (f) => { seen.push(f); return { capped: false, txs: new Map(ALL.map((h) => [h, { ts: 1000 }])) }; } }));
  assert.deepEqual(seen, [{ account_id: TREASURY, is_event_log: true }]);
});

test('T6b: a transaction returned twice or not asked for is read once or not at all', async () => {
  const a = await read(fake({ readTxs: async (hashes) => [...hashes.map((h) => TXS.get(h)), TXS.get(hashes[0]), tx('unlisted', t('x', TREASURY, USDC, '9'))] }));
  assert.equal(a, await read(fake()));
});

test('T6b: a day that cannot be read well enough is a gap: a cut listing, under 99% read, or no transfers throws', async () => {
  await assert.rejects(read(fake({ listAccount: async () => ({ capped: true, txs: new Map() }) })), /cut short/);
  await assert.rejects(read(fake({ readTxs: async (hashes) => hashes.slice(0, 1).map((h) => TXS.get(h)) })), /could be read/);
  await assert.rejects(read(fake({ listAccount: async () => ({ capped: false, txs: new Map() }) })), /could be read/);
  await assert.rejects(read(fake({ listAccount: async () => ({ capped: false, txs: new Map([['other', { ts: 1000 }]]) }) })), /no treasury transfers/);
});

// chain_day reads the same transactions for its census, so the treasury file must come out of that read.
const fillersDoc = { updated: '2026-11-04', fillers: [{ account: TREASURY, kind: 'hub', since: '2026-11-03' }, { account: 's1', kind: 'solver', since: '2026-11-03' }] };

test('T6b: chain_day writes the treasury file from its own read, the same flows as the backfill reads', async () => {
  const io = fake();
  let lists = 0;
  const r = await runDay({ day: '2026-11-05', io: { ...io, listAccount: async (...a) => { lists++; return io.listAccount(...a); } }, fillersDoc, log: quiet });
  assert.equal(lists, 2, 'one listing per filler, none added for the treasury file');
  const a = parseTreasuryFile(await r.treasury(), '2026-11-05');
  assert.deepEqual(a.problems, []);
  assert.deepEqual(a.flows, parseTreasuryFile(await readTreasuryDay({ day: '2026-11-05', fillers: [TREASURY, 's1'], io: fake(), log: quiet })).flows);
  assert.deepEqual(a.head.census, parseTreasuryFile(await read(fake())).head.census);
});

test('T6b: the chain text is ready before any treasury work, and a failed treasury file never stops the chain day freezing', async () => {
  const io = fake();
  let priced = 0;
  const failing = { ...io, priceBook: async (...a) => { if (++priced === 2) throw new Error('DefiLlama is down'); return io.priceBook(...a); } };
  const said = [];
  const r = await runDay({ day: '2026-11-05', io: failing, fillersDoc, log: (m) => said.push(m) });
  assert.equal(priced, 1, 'only the chain day has been priced when runDay returns');
  assert.equal(await r.treasury(), null);
  assert.ok(said.some((m) => /treasury file not written: DefiLlama is down/.test(m)));
  assert.deepEqual(parseDayFile(r.text, '2026-11-05').problems, []);
  assert.equal(r.text, (await runDay({ day: '2026-11-05', io: fake(), fillersDoc, log: quiet })).text);
});
