// T1 run 5: can transfer swaps (run 4) be named to a frontend? Transfer swaps carry no referral. This samples the hub's
// transactions for the day, takes the accounts that swapped through it, reads every transaction of theirs that day and
// looks for fees paid to frontend fee accounts, or a referral anywhere. It also looks for fees the hub itself pays out.
// Keyless public reads only. Writes spike/; it commits, signs and sends nothing.
// Usage: node pipeline/chain_attrib.mjs [YYYY-MM-DD]   env USERS (default 300), GAP_MS (default 1000). About 25 min.
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { chain } from './chain_io.mjs';
import { swapsOfTx, transfersOfTx, sampleHashes } from '../analysis/chain_swaps.mjs';

const DAY = process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const USERS = Number(process.env.USERS ?? 300);
const OUT = 'spike';
const HUB = '51e8f94d77b5e90dc9852ca6113771e11e8382ce69473a75e313e41665de7cbe';
// Run 4's fillers: the token_diff solvers and the hub.
const FILLERS = new Set([HUB, 'solver-priv-liq.near', 'solver-multichain-asset.near', '6247d9c671ca6a80cf2c75e26edb8cd75ebf00fcd3c56c39107d6ca20c9cfb29', 'blockzen-1-main.near', 'kipseli.near', 'solver-multichain-asset-escrow.near', 'brlabs-solver.near', '0x4f77780141b0770a33d270ee255beb25c9568c7b', 'solver-multichain-asset-2.near', 'crux-solver.near', 'solver-ref.near', 'blockzen-near-intent.near', 'twotwenty.near', '0x94845333028b1204fbe14e1278fd4adde46b22ce.near', '6af11753e21c3499f0c579d703879d0259c8a09155f4bc9c6d651a8fa09830ff', 'solver-priv-liq-2.near', 'blockzen-2-main.near']);
// Fee accounts that serve one referral (runs 1 to 3). 5880ad… is paid across many referrals.
const FEE_REF = { 'trustswapkit.near': '1click-swapkit', '2f09a4dc4b29cfdfe5d7a14afb04f0aa6c68e0b54f3bb606b168919b68085059': '1click-swapkit', 'dde5bb6ba7cee1b4343211a31b4ee3809fac0ca13b38a398c8ec401df658ccdc': '1click-swapkit', 'c4d748df238e6b27fe90ca0e409a68a78d22baee0475796e81a51901d3ee3426': '1click-swapkit', 'fae85d13273d1648ef3aab18ae4426122cf6b13170b633dac849ef7d83e1ed19': '1click-lifi', '2da316c13fcafc3a6c957ca6a9143622119a1a747bae0975c41a579d21a4cb6e': '1click-aurora' };
const SHARED = '5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd';

mkdirSync(OUT, { recursive: true });
const result = { run: 'attrib', day: DAY, startedAt: new Date().toISOString() };
const save = () => writeFileSync(`${OUT}/result.json`, JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n');
const t0 = Date.now();
const minutes = (from) => Math.round((Date.now() - from) / 600) / 100;
const { stats, listAccount, readTxs, heightAt } = chain({ gapMs: Number(process.env.GAP_MS ?? 1000) });
const tally = (xs, key) => { const m = new Map(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const share = (part, all) => (all ? Math.round((part / all) * 1000) / 1000 : null);

// 1. The hub's transactions for the day, a sample of them, and the accounts that sent it tokens.
const dayStart = Date.parse(`${DAY}T00:00:00Z`) / 1000;
const from = await heightAt(dayStart), to = await heightAt(dayStart + 86_400), toLate = await heightAt(dayStart + 86_400 + 3600);
const hub = await listAccount({ account_id: HUB, is_event_log: true }, from, to);
const hubTxs = await readTxs(sampleHashes([...hub.txs.keys()], 1000, `${DAY}:hub`));
const hubTransfers = hubTxs.flatMap(transfersOfTx);
const senders = [...new Set(hubTransfers.filter((x) => x.to === HUB && !FILLERS.has(x.from)).map((x) => x.from))];
const users = sampleHashes(senders, USERS, `${DAY}:users`);
result.hub = { transactions: hub.txs.size, read: hubTxs.length, senders: senders.length, users: users.length,
  // Does the hub pay fee accounts itself, on the users' behalf?
  paysOut: tally(hubTransfers.filter((x) => x.from === HUB && !FILLERS.has(x.to) && !senders.includes(x.to)), (x) => FEE_REF[x.to] ?? (x.to === SHARED ? 'shared 5880ad' : x.to)).slice(0, 10),
  minutes: minutes(t0) };
save();

// 2. Every transaction of each sampled user that day (an hour past midnight, for swaps that finish late).
let t = Date.now();
const perUser = [];
for (const u of users) {
  const l = await listAccount({ account_id: u, is_event_log: true }, from, toLate);
  const txs = await readTxs([...l.txs.keys()].slice(0, 40));
  const out = txs.flatMap(transfersOfTx).filter((x) => x.from === u && !FILLERS.has(x.to));
  const referrals = [...new Set(txs.flatMap(swapsOfTx).filter((s) => s.account === u).map((s) => s.referral))];
  const named = [...new Set(out.map((x) => FEE_REF[x.to]).filter(Boolean))];
  perUser.push({ user: u, transactions: l.txs.size, referrals, named, paysShared: out.some((x) => x.to === SHARED), otherRecipients: [...new Set(out.filter((x) => !FEE_REF[x.to] && x.to !== SHARED).map((x) => x.to))] });
  if (perUser.length % 50 === 0) { result.progress = perUser.length; save(); }
}

// 3. How many can be named, and how.
const n = perUser.length;
const byReferral = perUser.filter((p) => p.referrals.length), byFee = perUser.filter((p) => !p.referrals.length && p.named.length);
const sharedOnly = perUser.filter((p) => !p.referrals.length && !p.named.length && p.paysShared);
const otherOnly = perUser.filter((p) => !p.referrals.length && !p.named.length && !p.paysShared && p.otherRecipients.length);
const nothing = perUser.filter((p) => !p.referrals.length && !p.named.length && !p.paysShared && !p.otherRecipients.length);
result.users = {
  sampled: n, minutes: minutes(t),
  namedByReferral: share(byReferral.length, n), namedByFeeAccount: share(byFee.length, n),
  paysOnlyShared5880ad: share(sharedOnly.length, n), paysOnlyUnknownAccounts: share(otherOnly.length, n), paysNoOne: share(nothing.length, n),
  referralsSeen: tally(byReferral.flatMap((p) => p.referrals), (r) => r).slice(0, 10),
  feeNamed: tally(byFee.flatMap((p) => p.named), (r) => r),
  // Unknown accounts paid by many users may be frontend fee accounts not yet known.
  unknownRecipients: tally(perUser.flatMap((p) => p.otherRecipients), (r) => r).slice(0, 15),
  transactionsPerUser: tally(perUser, (p) => Math.min(p.transactions, 10)).sort((a, b) => a[0] - b[0]),
};
writeFileSync(`${OUT}/user_examples.json`, JSON.stringify(perUser.slice(0, 20), null, 1));
result.totalMinutes = minutes(t0);
result.fastnear = { ...stats };
result.finishedAt = new Date().toISOString();
save();

const u = result.users;
const summary = [
  `## App-naming check, ${DAY}`,
  `- Hub: ${hub.txs.size} transactions, ${senders.length} senders in a sample of ${hubTxs.length}; ${n} users followed`,
  `- Named by a referral elsewhere ${u.namedByReferral}, by a fee account ${u.namedByFeeAccount}; only 5880ad ${u.paysOnlyShared5880ad}; only unknown accounts ${u.paysOnlyUnknownAccounts}; pays no one ${u.paysNoOne}`,
  `- Run ${result.totalMinutes} min, FastNEAR calls ${stats.calls}, 429s ${stats.r429}`,
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
