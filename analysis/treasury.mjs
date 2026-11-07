// The Confidential Intents treasury (PREREG.md amendment A2). Pure: parsed day files and transfers in, shares and day files out. No network.
// A transfer to this account on intents.near moves funds to FAR, a private chain, and the swap settles there; a transfer from it moves funds back.
// A treasury day file (rule 8) is JSON lines, one finished UTC day, kept apart from data/chain so a frozen chain day is never touched:
//   {"t":"treasury", ...}  one header: how the day was read, transfer counts
//   {"t":"flow", ...}      transfers summed by direction × listed filler or other account × token
//   {"t":"dec"|"price", ...} the decimals and hourly prices the USD figures used
// No wallet addresses are kept: the only account named is the treasury.
import { bookLines, digestOf, gapsBetween, MIN_READ_SHARE } from './chain_day.mjs';

export const TREASURY = '51e8f94d77b5e90dc9852ca6113771e11e8382ce69473a75e313e41665de7cbe';
export const VERSION = 1;

export const isTreasury = (r) => r.solver === TREASURY;
const r2 = (x) => Math.round(x * 100) / 100;
const sum = (rows, f) => rows.reduce((t, r) => t + (r[f] || 0), 0);

// Rule 1: USD of groups whose solver is the treasury ÷ USD of all groups, over the days given. Treasury pairs undercount the flow, so it reads low, not high.
export function treasuryShare(days) {
  const rows = days.flatMap((d) => d.swaps);
  const allUsd = sum(rows, 'vol'), usd = sum(rows.filter(isTreasury), 'vol');
  return { days: days.length, usd: r2(usd), allUsd: r2(allUsd), share: allUsd > 0 ? usd / allUsd : null };
}

// Every transfer between the treasury and another account. rows: [{ ts, transfers }] with transfers from transfersOfTx.
export const treasuryTransfers = (rows) => rows.flatMap((r) => r.transfers.filter((t) => (t.from === TREASURY) !== (t.to === TREASURY)).map((t) => ({ ...t, ts: r.ts })));

// Rule 8: sums by token and direction, listed fillers and other accounts kept apart. usdAt(ts, side) is null when a price or decimals are missing:
// that transfer is counted and its raw amount kept, but it adds no USD.
export function flowRows(transfers, fillers, usdAt) {
  const flows = new Map();
  for (const t of transfers) {
    const dir = t.to === TREASURY ? 'in' : 'out';
    const who = fillers.has(dir === 'in' ? t.from : t.to) ? 'filler' : 'other';
    const key = JSON.stringify([dir, who, t.token]);
    const f = flows.get(key) ?? flows.set(key, { t: 'flow', dir, who, token: t.token, n: 0, np: 0, raw: 0n, usd: 0 }).get(key);
    const usd = usdAt(t.ts, [{ token: t.token, raw: t.raw }]);
    f.n++;
    f.raw += t.raw;
    if (usd != null) { f.np++; f.usd += usd; }
  }
  return [...flows].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, f]) => ({ ...f, raw: String(f.raw), usd: r2(f.usd) }));
}

// Builds the file text. meta: { day, fillers: [account], readShare (of the listing), hashes (the transactions holding a treasury transfer) }.
export function treasuryFile({ day, fillers, readShare, hashes }, transfers, usdAt, book) {
  const flows = flowRows(transfers, new Set(fillers), usdAt);
  const head = {
    t: 'treasury', v: VERSION, day, account: TREASURY, fillers: fillers.length,
    census: { transactions: hashes.length, readShare: Math.round(readShare * 1e5) / 1e5, digest: digestOf(hashes) },
    transfers: { all: sum(flows, 'n'), unpriced: sum(flows, 'n') - sum(flows, 'np') },
  };
  return [head, ...flows, ...bookLines(book)].map((l) => JSON.stringify(l)).join('\n') + '\n';
}

// Reads a treasury file back and checks it holds together. Returns { head, flows, problems }.
export function parseTreasuryFile(text, expectedDay = null) {
  const problems = [];
  let lines;
  try { lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return { head: null, flows: [], problems: [`not JSON lines: ${e.message}`] }; }
  const head = lines[0]?.t === 'treasury' ? lines[0] : null;
  if (!head) return { head: null, flows: [], problems: ['the first line is not the treasury header'] };
  const flows = lines.filter((l) => l.t === 'flow');
  if (head.v !== VERSION) problems.push(`unknown version ${head.v}`);
  if (expectedDay && head.day !== expectedDay) problems.push(`file says day ${head.day}, name says ${expectedDay}`);
  if (head.account !== TREASURY) problems.push('the file names another account');
  if (!(head.census?.readShare >= MIN_READ_SHARE)) problems.push(`only ${head.census?.readShare} of the listed transactions were read`);
  if (sum(flows, 'n') !== head.transfers?.all) problems.push(`transfers: header says ${head.transfers?.all}, rows add up to ${sum(flows, 'n')}`);
  if (sum(flows, 'n') - sum(flows, 'np') !== head.transfers?.unpriced) problems.push('unpriced transfers do not match the header');
  if (flows.some((f) => !['in', 'out'].includes(f.dir) || !['filler', 'other'].includes(f.who))) problems.push('a row has an unknown direction or account class');
  if (flows.some((f) => f.np > f.n)) problems.push('a row prices more transfers than it holds');
  return { head, flows, problems };
}

const usdOfFlows = (flows, dir, who) => r2(sum(flows.filter((f) => f.dir === dir && f.who === who), 'usd'));

// Rule 8: confidential share = other accounts' USD into the treasury ÷ (that + USD of all groups whose solver is not the treasury).
const shareOf = (otherIn, publicUsd) => (otherIn + publicUsd > 0 ? otherIn / (otherIn + publicUsd) : null);

// One row per frozen chain day. A day without a treasury file keeps its treasury share and has no confidential share.
function dayRow(d, file) {
  const t = treasuryShare([d]);
  const publicUsd = r2(t.allUsd - t.usd);
  const base = { day: d.head.day, usd: t.allUsd, treasuryUsd: t.usd, publicUsd, treasuryShare: t.share, pairedFlows: sum(d.swaps.filter(isTreasury), 'n') };
  if (!file) return { ...base, read: false, confidentialShare: null };
  const otherIn = usdOfFlows(file.flows, 'in', 'other');
  return {
    ...base, read: true, otherIn, fillerIn: usdOfFlows(file.flows, 'in', 'filler'), otherOut: usdOfFlows(file.flows, 'out', 'other'), fillerOut: usdOfFlows(file.flows, 'out', 'filler'),
    unpricedTransfers: file.head.transfers.unpriced, confidentialShare: shareOf(otherIn, publicUsd),
  };
}

// The last n rows. Treasury share uses every chain day; confidential share uses the days with a treasury file and says how many.
function windowOf(rows, n) {
  const w = rows.slice(-n), read = w.filter((r) => r.read);
  const allUsd = sum(w, 'usd');
  return {
    from: w[0]?.day ?? null, to: w.at(-1)?.day ?? null, days: w.length, daysRead: read.length,
    treasuryShare: allUsd > 0 ? sum(w, 'treasuryUsd') / allUsd : null,
    pairedFlows: sum(w, 'pairedFlows'),
    confidentialShare: read.length ? shareOf(sum(read, 'otherIn'), sum(read, 'publicUsd')) : null,
  };
}

// data/published/confidential.json. chainDays: parsed day files oldest first. files: Map of day -> parsed treasury file.
export function confidentialDoc(chainDays, files) {
  const perDay = chainDays.map((d) => dayRow(d, files.get(d.head.day)));
  return {
    account: TREASURY, perDay,
    missingDays: perDay.filter((r) => !r.read).map((r) => r.day),
    chainGaps: gapsBetween(perDay.map((r) => r.day)),
    last7: windowOf(perDay, 7), last30: windowOf(perDay, 30),
  };
}
