// Pure: one UTC day of intents.near swaps in, a frozen day file out, and the reverse (docs/PLAN.md §6, T2). No network.
// A day file is JSON lines, written the same way every time, so its sha256 can be anchored on chain:
//   {"t":"day", ...}  one header: the fillers read, how many transactions were listed and read, swap counts
//   {"t":"swap", ...} swaps grouped by kind × solver × referral × app fee × size bucket
//   {"t":"route", ...} swaps and USD per token in → token out
//   {"t":"dec"|"price", ...} the decimals and hourly prices the USD figures used
// No wallet addresses are kept: users are dropped, solvers and fee-free hubs are public filler accounts.
import { createHash } from 'node:crypto';
import { solversOfSwap } from './solvers.mjs';
import { swapsOfTx, transfersOfTx, transferSwaps, feeBps } from './chain_swaps.mjs';
import { BUCKETS, bucketOf } from './snapshot.mjs';

export const VERSION = 1;
export const UNPRICED = 'unpriced';
export const ALL_BUCKETS = [...BUCKETS, UNPRICED];
// A day is frozen only if at least this share of its listed transactions was read. Below it the day stays a gap.
export const MIN_READ_SHARE = 0.99;

const round2 = (x) => Math.round(x * 100) / 100;
const biggest = (side) => [...side].sort((a, b) => (a.raw === b.raw ? 0 : a.raw > b.raw ? -1 : 1))[0]?.token ?? '';

// What the census keeps of one raw transaction: the referred token_diff swaps (with solver and app fee already worked out)
// and the transfers that touch a filler. The raw transaction is then dropped, so a day fits in memory.
export function compactTx(tx, ts, fillers) {
  const swaps = swapsOfTx(tx);
  const solvers = swaps.length ? solversOfSwap([tx], new Set(swaps.map((s) => s.intentHash))).sort().join('+') : '';
  return {
    hash: tx.transaction?.hash ?? null, ts,
    swaps: swaps.map((s) => ({ referral: s.referral, give: s.give, get: s.get, feeBps: feeBps(s), solver: solvers, account: s.account })),
    transfers: transfersOfTx(tx).filter((t) => fillers.has(t.from) || fillers.has(t.to)),
  };
}

// Fillers seen in a sample of raw transactions: solvers named by token_diff swaps, and hubs, accounts that send transfers to and
// get them from at least minPartners other accounts (the transfer-fill hub of docs/PLAN.md §6a).
export function fillersOfSample(txs, minPartners = 3) {
  const solvers = new Set(), partners = new Map();
  const side = (a, k) => (partners.get(a) ?? partners.set(a, { sent: new Set(), got: new Set() }).get(a))[k];
  for (const tx of txs) {
    const swaps = swapsOfTx(tx);
    if (swaps.length) for (const s of solversOfSwap([tx], new Set(swaps.map((x) => x.intentHash)))) solvers.add(s);
    for (const t of transfersOfTx(tx)) { side(t.from, 'sent').add(t.to); side(t.to, 'got').add(t.from); }
  }
  const hubs = new Set([...partners].filter(([, p]) => p.sent.size >= minPartners && p.got.size >= minPartners).map(([a]) => a));
  return { solvers: [...solvers].sort(), hubs: [...hubs].sort() };
}

// The filler list only grows: an account once seen stays, because a quiet week does not make it stop filling.
// doc: { updated, fillers: [{ account, kind, since }] } or null. found: the result of fillersOfSample.
export function mergeFillers(doc, found, day) {
  const list = new Map((doc?.fillers ?? []).map((f) => [f.account, f]));
  const add = (account, kind) => { if (!list.has(account)) list.set(account, { account, kind, since: day }); };
  for (const a of found.solvers) add(a, 'solver');
  for (const a of found.hubs) add(a, 'hub');
  return { updated: day, fillers: [...list.values()].sort((a, b) => (a.account < b.account ? -1 : 1)) };
}

// A day's compact rows to its swaps, both kinds in one list.
// kind 'd' = token_diff swap (referral and app fee readable), 't' = transfer swap (no frontend can be named, run 5).
// A user already counted from a token_diff is left out of the transfer swaps, so no swap is counted twice.
export function swapsOfDay(rows, fillers) {
  const diff = rows.flatMap((r) => r.swaps.map((s) => ({ kind: 'd', solver: s.solver, referral: s.referral, feeBps: s.feeBps, give: s.give, get: s.get, ts: r.ts })));
  const diffUsers = new Set(rows.flatMap((r) => r.swaps.map((s) => s.account)));
  const transfer = transferSwaps(rows, fillers, diffUsers).map((s) => ({ kind: 't', solver: s.solver, referral: null, feeBps: null, give: s.give, get: s.get, ts: s.ts }));
  return [...diff, ...transfer];
}

// Groups swaps into snapshot rows. A swap with neither side priced goes to the 'unpriced' bucket with no USD.
// vol: USD of the side that is priced (in, else out), used for size and volume. in/out: summed only over swaps with both sides priced (np of them), so a cost is never worked out from one side.
export function groupSwaps(swaps, usdAt) {
  const groups = new Map(), routes = new Map();
  for (const s of swaps) {
    const usdIn = usdAt(s.ts, s.give), usdOut = usdAt(s.ts, s.get);
    const vol = usdIn ?? usdOut;
    const bucket = vol == null ? UNPRICED : bucketOf(vol);
    const fee = s.kind === 'd' ? s.feeBps : null;
    const key = JSON.stringify([s.kind, s.solver, s.referral ?? '', fee, bucket]);
    const g = groups.get(key) ?? groups.set(key, { t: 'swap', k: s.kind, solver: s.solver, ref: s.referral ?? '', fee, b: bucket, n: 0, np: 0, vol: 0, in: 0, out: 0 }).get(key);
    g.n++;
    if (vol != null) g.vol += vol;
    if (usdIn != null && usdOut != null) { g.np++; g.in += usdIn; g.out += usdOut; }
    const rk = JSON.stringify([biggest(s.give), biggest(s.get)]);
    const r = routes.get(rk) ?? routes.set(rk, { t: 'route', from: biggest(s.give), to: biggest(s.get), n: 0, vol: 0 }).get(rk);
    r.n++;
    if (vol != null) r.vol += vol;
  }
  const swapRows = [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, g]) => ({ ...g, vol: round2(g.vol), in: round2(g.in), out: round2(g.out) }));
  const routeRows = [...routes].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, r]) => ({ ...r, vol: round2(r.vol) }));
  return { swapRows, routeRows };
}

export const digestOf = (hashes) => createHash('sha256').update([...hashes].sort().join('\n')).digest('hex');

// The decimals and hourly prices a file's USD figures used, as its last lines.
export const bookLines = ({ decimals = [], prices = [] } = {}) => [
  ...[...decimals].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([token, d]) => ({ t: 'dec', token, d })),
  ...[...prices].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, price]) => { const [hour, id] = key.split('|'); return { t: 'price', hour: Number(hour), id, price }; }),
];

// Builds the day file text. meta: { day, fillers: [account], settlementTxs, listed, read, hashes (the read transactions), swapsCapped }.
export function dayFile({ day, fillers, settlementTxs = null, listed, read, hashes }, swaps, usdAt, book) {
  const { swapRows, routeRows } = groupSwaps(swaps, usdAt);
  const count = (k) => swapRows.filter((r) => r.k === k).reduce((t, r) => t + r.n, 0);
  const head = {
    t: 'day', v: VERSION, day, fillers: [...fillers].sort(), settlementTxs,
    census: { listed, read, readShare: listed ? Math.round((read / listed) * 1e5) / 1e5 : 0, digest: digestOf(hashes) },
    swaps: { diff: count('d'), transfer: count('t') },
  };
  const lines = [head, ...swapRows, ...routeRows, ...bookLines(book)];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

// Reads a day file back and checks it holds together. Returns { head, swaps, routes, decimals, priceIds, problems }. No network.
export function parseDayFile(text, expectedDay = null) {
  const problems = [];
  let lines;
  try { lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return { head: null, swaps: [], routes: [], problems: [`not JSON lines: ${e.message}`] }; }
  const head = lines[0]?.t === 'day' ? lines[0] : null;
  if (!head) return { head: null, swaps: [], routes: [], problems: ['the first line is not the day header'] };
  const swaps = lines.filter((l) => l.t === 'swap'), routes = lines.filter((l) => l.t === 'route');
  if (head.v !== VERSION) problems.push(`unknown version ${head.v}`);
  if (expectedDay && head.day !== expectedDay) problems.push(`file says day ${head.day}, name says ${expectedDay}`);
  if (!head.fillers?.length) problems.push('no fillers listed');
  for (const [k, name] of [['d', 'diff'], ['t', 'transfer']]) {
    const n = swaps.filter((r) => r.k === k).reduce((t, r) => t + r.n, 0);
    if (n !== head.swaps?.[name]) problems.push(`${name} swaps: header says ${head.swaps?.[name]}, rows add up to ${n}`);
  }
  if (swaps.some((r) => !ALL_BUCKETS.includes(r.b))) problems.push('a row has an unknown size bucket');
  if (swaps.some((r) => r.np > r.n)) problems.push('a row prices more swaps than it holds');
  if (routes.reduce((t, r) => t + r.n, 0) !== (head.swaps?.diff ?? 0) + (head.swaps?.transfer ?? 0)) problems.push('route rows do not add up to the swap count');
  if (head.census && head.census.readShare < MIN_READ_SHARE) problems.push(`only ${head.census.readShare} of the listed transactions were read`);
  const decimals = Object.fromEntries(lines.filter((l) => l.t === 'dec').map((l) => [l.token, l.d]));
  const priceIds = new Set(lines.filter((l) => l.t === 'price').map((l) => l.id));
  return { head, swaps, routes, decimals, priceIds, problems };
}

// Per-day summary for data/published/chain_days.json. days: [{ head, swaps, routes }] oldest first.
export function summarizeDays(days) {
  const rows = days.map(({ head, swaps }) => {
    const sum = (rs, f) => rs.reduce((t, r) => t + r[f], 0);
    const d = swaps.filter((r) => r.k === 'd'), t = swaps.filter((r) => r.k === 't');
    const byBucket = Object.fromEntries(ALL_BUCKETS.map((b) => [b, { swaps: sum(swaps.filter((r) => r.b === b), 'n'), usd: round2(sum(swaps.filter((r) => r.b === b), 'vol')) }]));
    const byRef = new Map();
    for (const r of d) byRef.set(r.ref, (byRef.get(r.ref) ?? 0) + r.vol);
    const usd = sum(swaps, 'vol'), dUsd = sum(d, 'vol');
    return {
      day: head.day, swaps: head.swaps.diff + head.swaps.transfer, tokenDiffSwaps: head.swaps.diff, transferSwaps: head.swaps.transfer,
      usd: round2(usd), tokenDiffUsd: round2(dUsd),
      tokenDiffShareOfSwaps: head.swaps.diff + head.swaps.transfer ? head.swaps.diff / (head.swaps.diff + head.swaps.transfer) : null,
      tokenDiffShareOfUsd: usd ? dUsd / usd : null,
      unpricedSwaps: byBucket[UNPRICED].swaps, byBucket,
      namedShareOfTokenDiffUsd: dUsd ? sum(d.filter((r) => r.ref && r.ref !== '1click-unknown'), 'vol') / dUsd : null,
      topReferrals: [...byRef].filter(([r]) => r).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([ref, v]) => ({ referral: ref, usd: round2(v) })),
      solvers: new Set(swaps.map((r) => r.solver).filter(Boolean)).size, fillers: head.fillers.length,
      census: head.census,
    };
  });
  return { days: rows, firstDay: rows[0]?.day ?? null, lastDay: rows.at(-1)?.day ?? null, gaps: gapsBetween(rows.map((r) => r.day)) };
}

// UTC days between the first and last frozen day that have no file. Shown, never filled in.
export function gapsBetween(days) {
  const out = [];
  for (let i = 1; i < days.length; i++) {
    for (let t = Date.parse(`${days[i - 1]}T00:00:00Z`) + 86_400_000; t < Date.parse(`${days[i]}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
