import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runDay, isOver, defaultDay, needsDiscovery } from './chain_day.mjs';
import { parseDayFile } from '../analysis/chain_day.mjs';

const log = (event, data) => `EVENT_JSON:${JSON.stringify({ standard: 'dip4', version: '0.4.3', event, data })}`;
const tx = (hash, ...logs) => ({ transaction: { hash }, receipts: [{ execution_outcome: { outcome: { logs } } }] });
const USDC = 'nep141:usdc.near', WNEAR = 'nep141:wrap.near';
const t = (from, to, token, raw) => log('transfer', [{ account_id: from, receiver_id: to, tokens: { [token]: raw } }]);

// One token_diff swap by solver s1, three users swapping through hub h (so h has the partners a hub needs), noise.
const TXS = new Map([
  tx('A', log('token_diff', [
    { intent_hash: 'U', account_id: 'u0', referral: '1click-lifi', diff: { [USDC]: '-1000000000', [WNEAR]: '250000000000000000000000000' } },
    { intent_hash: 'S', account_id: 's1', diff: { [USDC]: '1000000000', [WNEAR]: '-250000000000000000000000000' } },
  ])),
  ...['1', '2', '3'].flatMap((n) => [tx(`out${n}`, t(`u${n}`, 'h', USDC, '100000000')), tx(`back${n}`, t('h', `u${n}`, WNEAR, '24000000000000000000000000'))]),
].map((x) => [x.transaction.hash, x]));
const ALL = [...TXS.keys()];

const fake = (over = {}) => {
  const stats = { calls: 0, r429: 0 };
  return {
    stats,
    heightAt: async (ts) => ts,
    listAccount: async (filter) => ({ capped: false, pages: 1, txs: new Map((filter.account_id === 'intents.near' ? ALL : ALL).map((h) => [h, { ts: 1000, isSigner: true }])) }),
    readTxs: async (hashes) => hashes.map((h) => TXS.get(h)),
    priceBook: async () => ({ priceAt: () => (token) => ({ [USDC]: 1, [WNEAR]: 4 })[token] ?? null, dec: (token) => ({ [USDC]: 6, [WNEAR]: 24 })[token] ?? null, calls: 1, prices: new Map([['0|near:x', 2]]) }),
    ...over,
  };
};
const quiet = () => {};

test('a first run finds the fillers, reads the census and freezes a day file that parses clean', async () => {
  const r = await runDay({ day: '2026-11-03', io: fake(), fillersDoc: null, log: quiet });
  assert.deepEqual(r.fillersDoc.fillers.map((f) => [f.account, f.kind]), [['h', 'hub'], ['s1', 'solver']]);
  const p = parseDayFile(r.text, '2026-11-03');
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.head.swaps, { diff: 1, transfer: 3 });
  assert.equal(p.head.settlementTxs, 7);
  assert.equal(p.head.census.listed, 7);
});

test('a transaction returned twice or not asked for is read once or not at all', async () => {
  const io = fake({ readTxs: async (hashes) => [...hashes.map((h) => TXS.get(h)), TXS.get(hashes[0]), tx('unlisted')] });
  const a = await runDay({ day: '2026-11-03', io, fillersDoc: null, log: quiet });
  const b = await runDay({ day: '2026-11-03', io: fake(), fillersDoc: null, log: quiet });
  assert.equal(parseDayFile(a.text).head.census.read, 7);
  assert.equal(a.text, b.text);
});

test('the same inputs freeze to the same bytes', async () => {
  const a = await runDay({ day: '2026-11-03', io: fake(), fillersDoc: null, log: quiet });
  const b = await runDay({ day: '2026-11-03', io: fake(), fillersDoc: null, log: quiet });
  assert.equal(a.text, b.text);
});

test('with a recent filler list the day skips the settlement listing', async () => {
  const doc = { updated: '2026-11-01', fillers: [{ account: 'h', kind: 'hub', since: '2026-11-01' }, { account: 's1', kind: 'solver', since: '2026-11-01' }] };
  const listed = [];
  const io = fake({ listAccount: async (f) => { listed.push(f.account_id); return { capped: false, txs: new Map(ALL.map((h) => [h, { ts: 1000 }])) }; } });
  const r = await runDay({ day: '2026-11-03', io, fillersDoc: doc, log: quiet });
  assert.deepEqual(listed.sort(), ['h', 's1']);
  assert.equal(r.fillersDoc, doc);
  assert.equal(parseDayFile(r.text).head.settlementTxs, null);
});

test('discovery runs when the list is missing, a week old, or asked for', () => {
  assert.equal(needsDiscovery(null, '2026-11-03'), true);
  assert.equal(needsDiscovery({ updated: '2026-10-27' }, '2026-11-03'), true);
  assert.equal(needsDiscovery({ updated: '2026-10-28' }, '2026-11-03'), false);
  assert.equal(needsDiscovery({ updated: '2026-11-02' }, '2026-11-03', true), true);
});

test('a day that cannot be read well is not frozen', async () => {
  const doc = { updated: '2026-11-03', fillers: [{ account: 's1', kind: 'solver', since: '2026-11-03' }] };
  await assert.rejects(runDay({ day: '2026-11-03', io: fake({ listAccount: async () => ({ capped: true, txs: new Map() }) }), fillersDoc: doc, log: quiet }), /cut short/);
  await assert.rejects(runDay({ day: '2026-11-03', io: fake({ readTxs: async (h) => h.slice(0, 1).map((x) => TXS.get(x)) }), fillersDoc: doc, log: quiet }), /could be read/);
  await assert.rejects(runDay({ day: '2026-11-03', io: fake({ readTxs: async (h) => h.map(() => tx('N')) }), fillersDoc: doc, log: quiet }), /no swaps|could be read/);
});

test('a day freezes only after it is over, and the default is yesterday', () => {
  assert.equal(isOver('2026-11-03', new Date('2026-11-04T01:59:00Z')), false);
  assert.equal(isOver('2026-11-03', new Date('2026-11-04T02:00:00Z')), true);
  assert.equal(defaultDay(new Date('2026-11-05T03:17:00Z')), '2026-11-04');
});

test('a day that is not over exits non-zero and writes nothing', () => {
  const r = spawnSync(process.execPath, ['pipeline/chain_day.mjs', '2999-01-01'], { encoding: 'utf8', env: { ...process.env, CHAIN_DIR: 'never-written' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not over yet/);
});

test('verify rebuilds chain_days.json from the frozen day files, and catches an edited day', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'chain-')), pub = mkdtempSync(join(tmpdir(), 'pub-'));
  cpSync('data/published', pub, { recursive: true });
  const day = (await runDay({ day: '2026-11-03', io: fake(), fillersDoc: null, log: quiet })).text;
  writeFileSync(join(dir, '2026-11-03.jsonl'), day);
  const env = { ...process.env, CHAIN_DIR: dir, PUBLISHED_DIR: pub };
  const build = spawnSync(process.execPath, ['pipeline/build_chain_days.mjs'], { env: { ...env, OUT: join(pub, 'chain_days.json') }, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  assert.equal(JSON.parse(readFileSync(join(pub, 'chain_days.json'), 'utf8')).lastDay, '2026-11-03');
  const run = () => spawnSync(process.execPath, ['pipeline/verify.mjs'], { env, encoding: 'utf8' });
  assert.match(run().stdout, /OK   chain_days\.json/);
  writeFileSync(join(dir, '2026-11-03.jsonl'), day.replace('"diff":1', '"diff":2'));
  const bad = run();
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /FAIL chain_days\.json[\s\S]*diff swaps: header says 2/);
});

test('thesis.json names the last frozen chain day, which is what the Data Is Late banner reads', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const last = readdirSync('data/chain').filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().at(-1)?.slice(0, 10) ?? null;
  assert.equal(JSON.parse(readFileSync('data/published/thesis.json', 'utf8')).snapshotLastDay, last);
  assert.ok(last >= '2026-11-03', 'the first frozen day is 2026-11-03; later days only add to it');
});
