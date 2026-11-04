// Pure: FastNEAR transactions of intents.near in, swaps out (docs/PLAN.md §2). Reads dip4 logs only; no network.
import { createHash } from 'node:crypto';
import { events } from './solvers.mjs';

const big = (v) => { try { return BigInt(v); } catch { return 0n; } };
const sides = (diff) => {
  const give = [], get = [];
  for (const [token, v] of Object.entries(diff ?? {})) {
    const n = big(v);
    if (n < 0n) give.push({ token, raw: -n }); else if (n > 0n) get.push({ token, raw: n });
  }
  return { give, get };
};

// Every token_diff entry of one transaction: who, what went in and out, the protocol fee, the referral if any.
export function diffsOfTx(tx) {
  return events(tx).filter((e) => e.event === 'token_diff').flatMap((e) => (e.data ?? []).map((d) => ({
    account: d.account_id, intentHash: d.intent_hash, referral: d.referral ?? null, ...sides(d.diff),
    protocolFees: Object.entries(d.fees_collected ?? {}).map(([token, raw]) => ({ token, raw: big(raw) })),
  })));
}

// A swap is a token_diff entry with a referral: the user's side of a referred intent. Its app fees are the dip4 transfers
// the same account sends in the same transaction (PLAN §2: the app fee is a separate transfer to a fee account).
export function swapsOfTx(tx) {
  const transfers = events(tx).filter((e) => e.event === 'transfer').flatMap((e) => e.data ?? []);
  const hash = tx.transaction?.hash ?? null;
  return diffsOfTx(tx).filter((d) => d.referral).map((d) => ({
    hash, ...d,
    appFees: transfers.filter((t) => t.account_id === d.account).flatMap((t) => Object.entries(t.tokens ?? {}).map(([token, raw]) => ({ recipient: t.receiver_id, token, raw: big(raw) }))),
  }));
}

// Every dip4 transfer of one transaction, one row per token.
export const transfersOfTx = (tx) => events(tx).filter((e) => e.event === 'transfer').flatMap((e) => e.data ?? [])
  .flatMap((t) => Object.entries(t.tokens ?? {}).map(([token, raw]) => ({ from: t.account_id, to: t.receiver_id, token, raw: big(raw), intentHash: t.intent_hash })));

// Tokens leaving intents.near: ft_withdraw names its token, native_withdraw is wNEAR. Other withdraw events are counted by name only.
export const withdrawalsOfTx = (tx) => events(tx).filter((e) => e.event.endsWith('_withdraw')).flatMap((e) => (e.data ?? []).map((d) => ({
  event: e.event, account: d.account_id,
  token: e.event === 'ft_withdraw' ? `nep141:${d.token}` : e.event === 'native_withdraw' ? 'nep141:wrap.near' : null, raw: big(d.amount),
})));

// Swaps filled by plain dip4 transfers, across a day's transactions: an account sends tokens to a solver and gets a
// different token back from that same solver. Accounts in skip (already counted from a token_diff) are left out.
// txs: [{ hash, ts, transfers }] with transfers from transfersOfTx.
export function transferSwaps(txs, solvers, skip = new Set()) {
  const pairs = new Map();
  for (const t of txs) for (const x of t.transfers) {
    const out = solvers.has(x.to) && !solvers.has(x.from), back = solvers.has(x.from) && !solvers.has(x.to);
    if (!out && !back) continue;
    const user = out ? x.from : x.to, solver = out ? x.to : x.from;
    if (skip.has(user)) continue;
    const k = `${user}|${solver}`;
    const p = pairs.get(k) ?? pairs.set(k, { user, solver, give: new Map(), get: new Map(), hashes: new Set(), ts: t.ts }).get(k);
    const side = out ? p.give : p.get;
    side.set(x.token, (side.get(x.token) ?? 0n) + x.raw);
    p.hashes.add(t.hash);
    p.ts = Math.min(p.ts, t.ts);
  }
  const list = (m) => [...m].map(([token, raw]) => ({ token, raw }));
  return [...pairs.values()].filter((p) => p.give.size && [...p.get.keys()].some((k) => !p.give.has(k)))
    .map((p) => ({ user: p.user, solver: p.solver, ts: p.ts, hashes: [...p.hashes], give: list(p.give), get: list(p.get) }));
}

// App fee in bps of the amount in, when the fee is paid in a token the swap gives. Null when it can't be read that way.
export function feeBps(swap, recipient) {
  const fees = swap.appFees.filter((f) => !recipient || f.recipient === recipient);
  if (!fees.length) return recipient ? null : 0;
  let bps = 0;
  for (const f of fees) {
    const g = swap.give.find((x) => x.token === f.token);
    if (!g) return null;
    // The transfer is its own intent, outside the token_diff, so the user gave in + fee in all.
    bps += (Number(f.raw) / (Number(g.raw) + Number(f.raw))) * 1e4;
  }
  return Math.round(bps * 10) / 10;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58Hex(s) {
  let n = 0n;
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const hex = n ? n.toString(16) : '';
  return '00'.repeat(s.match(/^1*/)[0].length) + (hex.length % 2 ? '0' : '') + hex;
}

// intents.near token ids to DefiLlama coin ids. Null when there is no sure mapping: those swaps are counted as unpriced, never guessed.
// Every mapping is checked on real swaps by sideAgreement: a wrong id or wrong decimals makes the two sides of a swap disagree.
const NATIVE = { eth: 'ethereum', base: 'ethereum', arb: 'ethereum', op: 'ethereum', btc: 'bitcoin', sol: 'solana', zec: 'zcash', doge: 'dogecoin', xrp: 'ripple', tron: 'tron', sui: 'sui', ltc: 'litecoin', bera: 'berachain-bera', gnosis: 'xdai', pol: 'polygon-ecosystem-token', bsc: 'binancecoin', avax: 'avalanche-2', ada: 'cardano', aptos: 'aptos', bch: 'bitcoin-cash', stellar: 'stellar', ton: 'the-open-network', dash: 'dash', plasma: 'plasma' };
const EVM = { eth: 'ethereum', base: 'base', arb: 'arbitrum', op: 'optimism', bsc: 'bsc', pol: 'polygon', avax: 'avax', gnosis: 'xdai', bera: 'berachain', plasma: 'plasma' };
// HOT omni tokens: nep245:v2_1.omni.hot.tg:<EVM chain id>_<base58 of the token address>.
const HOT_CHAIN = { 1: 'ethereum', 10: 'optimism', 56: 'bsc', 137: 'polygon', 8453: 'base', 42161: 'arbitrum', 43114: 'avax' };
const HOT_NATIVE = { 1: 'ethereum', 10: 'ethereum', 56: 'binancecoin', 137: 'polygon-ecosystem-token', 8453: 'ethereum', 42161: 'ethereum', 43114: 'avalanche-2' };
export function llamaId(token) {
  const hot = token.match(/^nep245:v2_1\.omni\.hot\.tg:(\d+)_([1-9A-HJ-NP-Za-km-z]+)$/);
  if (hot) {
    const hex = HOT_CHAIN[hot[1]] && base58Hex(hot[2]);
    if (hex === '0'.repeat(40)) return `coingecko:${HOT_NATIVE[hot[1]]}`;
    return hex?.length === 40 ? `${HOT_CHAIN[hot[1]]}:0x${hex}` : null;
  }
  if (!token.startsWith('nep141:')) return null;
  const c = token.slice(7);
  if (c === 'wrap.near') return 'coingecko:near';
  const omft = c.match(/^([a-z]+)(?:-(0x[0-9a-f]{40}))?\.omft\.near$/);
  if (omft) return omft[2] ? (EVM[omft[1]] ? `${EVM[omft[1]]}:${omft[2]}` : null) : (NATIVE[omft[1]] ? `coingecko:${NATIVE[omft[1]]}` : null);
  if (c.endsWith('.omft.near')) return null;
  return `near:${c}`;
}

// USD of one side, or null if any token on it has no price or no decimals.
export function usdOf(side, priceOf, decimalsOf) {
  let usd = 0;
  for (const { token, raw } of side) {
    const p = priceOf(token), d = decimalsOf(token);
    if (p == null || d == null) return null;
    usd += (Number(raw) / 10 ** d) * p;
  }
  return usd;
}

// What the user got over what they gave, in USD. Near 1 when both prices and both decimals are right; null if a side is unpriced.
export function sideAgreement(swap, priceOf, decimalsOf) {
  const give = usdOf(swap.give, priceOf, decimalsOf), get = usdOf(swap.get, priceOf, decimalsOf);
  return give && get != null && swap.get.length ? get / give : null;
}

// Seeded draw of n hashes: rank by sha256(seed:hash). The same list and seed give the same sample on any machine, in any order.
export function sampleHashes(hashes, n, seed) {
  const key = (h) => createHash('sha256').update(`${seed}:${h}`).digest('hex');
  return hashes.map((h) => [key(h), h]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, n).map((x) => x[1]);
}

// Total over N units from a simple random sample of per-unit values, with a 95% interval (normal, finite population correction).
export function extrapolate(values, N) {
  const n = values.length;
  if (!n) return { total: null, lo: null, hi: null };
  const mean = values.reduce((t, v) => t + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((t, v) => t + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const se = N * (sd / Math.sqrt(n)) * Math.sqrt(Math.max(0, 1 - n / N));
  return { total: N * mean, lo: N * mean - 1.96 * se, hi: N * mean + 1.96 * se };
}
