// Keyless chain reads shared by the chain jobs: FastNEAR transactions API, NEAR archival RPC, DefiLlama hourly prices.
import { getJson, retry } from './http.mjs';
import { llamaId } from '../analysis/chain_swaps.mjs';

const FAST = 'https://tx.main.fastnear.com';
const RPC = 'https://archival-rpc.mainnet.fastnear.com';
const GENESIS = 9_820_210;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function chain({ gapMs = 1000, maxPages = 1500 } = {}) {
  const stats = { calls: 0, r429: 0, errors: 0, rpcCalls: 0 };

  // FastNEAR at one call per gapMs. A 429 waits and tries again; every call and every 429 is counted.
  let lastCall = 0;
  async function fast(path, body) {
    for (let n = 1; ; n++) {
      const wait = lastCall + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      stats.calls++;
      try {
        const r = await fetch(FAST + path, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'tideline' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
        if (r.status === 429) { stats.r429++; if (n >= 12) throw new Error('429 after 12 tries'); await sleep(5_000 * n); continue; }
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
        return await r.json();
      } catch (e) {
        if (e.message.startsWith('429')) throw e;
        stats.errors++;
        if (n >= 6) throw new Error(`FastNEAR ${path}: ${e.message}`);
        await sleep(2_000 * n);
      }
    }
  }
  // Every transaction one account appears in, between two heights, oldest first. maxPages caps it in case a filter is ignored.
  async function listAccount(filter, fromH, toH) {
    const txs = new Map(); // hash -> { ts (s), isSigner }
    let resume = null, pages = 0;
    do {
      const r = await fast('/v0/account', { ...filter, from_tx_block_height: fromH, to_tx_block_height: toH - 1, limit: 200, desc: false, ...(resume ? { resume_token: resume } : {}) });
      pages++;
      for (const x of r.account_txs ?? []) if (x.tx_block_height >= fromH && x.tx_block_height < toH) txs.set(x.transaction_hash, { ts: Number(BigInt(x.tx_block_timestamp) / 1_000_000_000n), isSigner: x.is_signer });
      resume = r.account_txs?.length ? r.resume_token : null;
    } while (resume && pages < maxPages);
    return { txs, pages, capped: pages >= maxPages };
  }
  async function readTxs(hashes) {
    const out = [];
    for (let i = 0; i < hashes.length; i += 20) out.push(...((await fast('/v0/transactions', { tx_hashes: hashes.slice(i, i + 20) })).transactions ?? []).filter(Boolean));
    return out;
  }

  // RPC at most one call per 250 ms. Its free tier also answers -429 when busy, so it gets 10 tries over about 4 minutes.
  let lastRpc = 0;
  const rpc = (method, params) => retry('NEAR RPC', async () => {
    const wait = lastRpc + 250 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRpc = Date.now();
    stats.rpcCalls++;
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(30_000) });
    const j = await r.json();
    if (j.error?.cause?.name === 'UNKNOWN_BLOCK') return null;
    if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
    return j.result;
  }, { tries: 10, waitMs: 5_000 });
  const tsOf = (b) => Number(BigInt(b.header.timestamp) / 1_000_000n) / 1000; // seconds
  // The first existing block at or after height h (heights can be skipped).
  async function blockFrom(h) {
    for (let k = 0; k < 100; k++) { const b = await rpc('block', { block_id: h + k }); if (b) return b; }
    throw new Error(`no block from ${h}`);
  }
  // The first block whose timestamp is at or after t (seconds).
  let top = null;
  async function heightAt(t) {
    top ??= await rpc('block', { finality: 'final' });
    const est = Math.round(top.header.height - (tsOf(top) - t) * 1.7);
    let lo = Math.max(GENESIS, est - 100_000), hi = Math.min(top.header.height, est + 100_000);
    while (tsOf(await blockFrom(lo)) >= t) lo = Math.max(GENESIS, lo - 400_000);
    if (tsOf(await blockFrom(hi)) < t) hi = top.header.height;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (tsOf(await blockFrom(mid)) >= t) hi = mid; else lo = mid; }
    return (await blockFrom(hi)).header.height;
  }

  // Decimals from ft_metadata on chain (DefiLlama's for HOT tokens, which have none on chain), prices per hour from DefiLlama.
  // uses: [{ ts, token }]. Returns priceAt(ts)(token) and dec(token), null where unknown.
  async function priceBook(uses) {
    const decimals = new Map();
    for (const token of new Set(uses.map((u) => u.token))) {
      if (!token.startsWith('nep141:')) continue;
      try {
        const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: token.slice(7), method_name: 'ft_metadata', args_base64: '' });
        decimals.set(token, JSON.parse(Buffer.from(r.result).toString()).decimals);
      } catch { /* no metadata: the token stays unpriced */ }
    }
    const hourOf = (ts) => Math.floor(ts / 3600) * 3600;
    const wanted = new Map(); // hour -> Set of llama ids
    for (const { ts, token } of uses) {
      const id = llamaId(token);
      if (id && ts) (wanted.get(hourOf(ts)) ?? wanted.set(hourOf(ts), new Set()).get(hourOf(ts))).add(id);
    }
    const prices = new Map(), llamaDecimals = new Map();
    let calls = 0;
    for (const [hour, ids] of wanted) {
      const list = [...ids];
      for (let i = 0; i < list.length; i += 30) {
        calls++;
        const r = await getJson(`https://coins.llama.fi/prices/historical/${hour + 1800}/${list.slice(i, i + 30).join(',')}?searchWidth=2h`).catch(() => ({ coins: {} }));
        for (const [id, c] of Object.entries(r.coins ?? {})) { prices.set(`${hour}|${id}`, c.price); if (c.decimals != null) llamaDecimals.set(id, c.decimals); }
      }
    }
    const dec = (token) => decimals.get(token) ?? (token.startsWith('nep245:') ? llamaDecimals.get(llamaId(token)) ?? null : null);
    const priceAt = (ts) => (token) => { const id = llamaId(token); return id && ts ? prices.get(`${hourOf(ts)}|${id}`) ?? null : null; };
    return { priceAt, dec, calls, prices };
  }

  return { stats, fast, listAccount, readTxs, rpc, heightAt, priceBook };
}
