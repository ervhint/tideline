# Tideline: build plan

Status: draft, 4 Nov 2026. T0 done. T1 measured (§6a); the human chose to go on the census.

## 1. Why public chain data only

The 1ClickSwap API Terms (partners.near-intents.org/legal/terms-of-service, updated 7 Oct 2026), which apply to anyone who generates a key or uses the API:
- **§4.1(e):** no caching, storing or archiving of API data beyond 24 hours, except static transaction records needed to show end users their own history;
- **§17.6:** §4 keeps applying after the terms end.

A re-runnable thesis has to keep its inputs. So Tideline uses no Explorer or 1Click API data at all: only public chain data and keyless sources, which anyone can store and re-fetch.

## 2. What the chain gives us (checked 4 Nov 2026)

Checks against FastNEAR (`tx.main.fastnear.com`, no key), on `intents.near` transactions signed by `intents.near` itself (the settlement transactions):

| Question | Answer | Evidence |
| --- | --- | --- |
| Is the frontend on chain? | **Yes.** `dip4` `token_diff` events carry `referral`, written as `1click-<partner>` (`1click-swapkit`, `1click-lifi`, `1click-rango`, `1click-aurora-…`, `1click-cow`) plus a few non-1Click ones (`intents.tg`) | 2,000 settlement transactions from 3 Nov: 377 swaps with a referral, 33 distinct referrals |
| Can the frontend be unknown? | **Yes, often.** `1click-unknown` was 100 of 377 swaps (27%). Whether other sources name these frontends is not known | Same sample |
| Amounts in and out? | **Yes,** per account and token, in raw units (`diff`) | `token_diff.data[].diff` |
| Protocol fee? | **Yes,** `fees_collected` per token on every `token_diff` | Same |
| App fee? | **Indirectly.** It shows up as a separate `dip4` `transfer` from the user to a fee account in the same transaction. The rate has to be worked out as transfer ÷ swap amount | Example transfers to `5880ad…` (the account AC-3.3 asks about) |
| Solver? | **Yes,** the other side of the `token_diff` (`solversOfSwap` in `analysis/solvers.mjs`) | SRS E3 |
| USD value? | **Not on chain.** DefiLlama `coins.llama.fi` gives historical prices with no key (wNEAR found; `*.omft.near` tokens need a mapping to their CoinGecko ids) | curl, 4 Nov |
| Full history for free? | **No.** About 90,000 settlement transactions a day now (about 17,500 in Aug 2025), 24.5M in total. Reading a transaction's logs takes one call per 20 transactions. At the pace FastNEAR's free tier allowed (about 1 call a second before 429s), one day takes about 3 hours to read in full. Listing is cheap: 200 hashes per call, about 8 minutes a day | Timed run: 2,000 transactions in 250 s, 113 calls, 3 retries after 429 |
| Other free archives? | BigQuery `crypto_near_mainnet_us` is fed by NEAR Lake, which NEAR's docs say stopped on 24 Mar 2026. Dune isn't free. Flipside wasn't reachable (SRS 1.3). Not used | NEAR docs |

**What this means:** today's flow can be measured from the chain every day. Months of full history can't be, at free-tier speed. So Tideline **samples** each day, using a seeded random draw from the full list of that day's settlement transactions. The other route is to pull only the transactions that name one account. Every number carries a sampling interval.

The chain covers all Intents settlement, not just the 1Click share (the Explorer holds about 38% of DefiLlama's volume, SRS D21). Whether the sample's volume reconciles with DefiLlama is the first thing the spike checks.

## 3. Sources

| Use | Source | Key | Stored in the repo |
| --- | --- | --- | --- |
| Swaps, referral, fees, solvers | FastNEAR transactions API (open source: github.com/fastnear/explorer-api) | None | Daily summaries by referral × fee × size bucket, plus the sampled transaction hashes, so anyone can re-fetch the same sample |
| Spot checks | NEAR archival RPC | None | Hashes and results |
| Volume, fees, revenue, buybacks (V*, Q2, Q5) | DefiLlama | None | Yes |
| USD prices | DefiLlama coins | None | Prices used, per token and hour |
| Token names | `ft_metadata` on chain over RPC | None | Yes |
| Issuance, supply, protocol fee | RPC and the `intents.near` contract | None | Yes |
| Control venues | DefiLlama (CoW, 1inch, 0x, KyberSwap, LI.FI) | None | Yes |

**Not used:** the Explorer API and the 1Click API (their terms, §1). The same goes for Binance minute prices until its API terms are read. Check before building: whether FastNEAR and DefiLlama publish terms that limit storing their data. Neither had terms we could find on 4 Nov.

## 4. Each reading and where it comes from

| Reading | How |
| --- | --- |
| V* and its date path (E5) | DefiLlama + RPC (`lib/model.ts`). Live now |
| Q2 NEAR's share of fees | DefiLlama. Live now |
| Q5 path to deflation | DefiLlama. Live now |
| Model page, sliders | `lib/model.ts`. Live now |
| Q4 largest integrator | 30 sampled days. Share of fees by referral, with a bootstrap interval. `1click-unknown` is shown as its own row, never counted as one integrator |
| Q3 top-3 solvers (E3) | The same sample gives the solver directly |
| Q3 solver spread | Realised cost: what users actually got on chain vs the DefiLlama price at that hour, minus app and protocol fees. It measures real fills, not quotes, but hourly prices are coarser than minute prices, so small spreads read less precisely. Threshold wording goes in PREREG.md |
| Follow the fee (FR-05) | Built from realised swaps, by size bucket. Route detail only where the sample is large enough |
| Q1 pricing power (E1) | **At risk.** See §5 |
| E2 pass-through | The same realised cost, per event window, only if §5 finds the events |
| Coverage board (FR-21) | Tokens seen in the sample, named from `ft_metadata` |
| Attest contract | `tideline-thesis.testnet`. It anchors each day's chain sample file, so the attested data is ours and fully re-fetchable |
| Alarm, refresh, BFF, feeds, verify | The refresh job runs the chain sample each day |

## 5. The hard part: elasticity (Q1)

Q1 needs fee-change events: days when a frontend changed its fee rate. Two routes from chain data, both measured in the spike before we commit:

1. **By fee account (preferred).** FastNEAR indexes accounts named in event logs (`is_event_log`). A frontend's fee account (for example `trustswapkit.near` for SwapKit, with about 350,000 transactions in an earlier check) therefore lists every swap that paid it a fee, and only those need reading. This works for events where the frontend **already charged a fee before** the change. It can't see the "before" side of a 0 → X event, because a 0-fee swap pays no one.
2. **By sampling** the event windows from the full transaction list. It covers every event, but small frontends get too few swaps per window, and the cost (about 15 minutes a day of history at a 10% sample) adds up to days of runs.

**Honesty point:** Tideline can't be pre-registered blind. An earlier private analysis by the same author, on Explorer data, estimated elasticity at -0.52 (interval -1.43 to 0.39) from 22 fee-change events, and that result has been seen. PREREG.md must say so on its first line. The fee-change events are found from chain data by the event rules written into PREREG.md before any volume is read, with no changes after.

If neither route gives at least 3 usable events, Q1 reads Not Measured (SRS D2), and the verdict rule decides whether the thesis still reads anything. This could be the real result: Tideline may end up with four readings and an honest blank.

## 6. Units

Deadline 14 Nov 23:59 UTC.

| # | Unit | Est. | Done when |
| --- | --- | --- | --- |
| T0 | **Repo and rename.** Private `ervhint/tideline`; site and docs say Tideline; secrets added; `contract-deploy` to `tideline-thesis.testnet` | 3h | Done 4 Nov: `npm test` passes, site runs locally with DefiLlama readings, contract deployed |
| T1 | **Spike, go or no-go.** One-day chain sampler. Measure time per day, 429 rate, settled volume vs DefiLlama, `1click-unknown` share, app-fee detection, price coverage, and the fee-account route for 3 real events | 4h | Numbers written down. **Go** if a daily sample runs in under 30 minutes in Actions and the sampled volume lands within ±25% of DefiLlama. Otherwise stop and decide with the human |
| T2 | **Daily chain snapshot.** Seeded sample per day, snapshot by referral × fee × size bucket, freeze and attest each finished day, verify rebuilds it with no network | 6h | `npm run verify` OK; `attest:check` MATCH on a frozen day. Built 4 Nov (`pipeline/chain_day.mjs`, `analysis/chain_day.mjs`, `chain-day.yml`); first day 2026-11-03 frozen and anchored; schedules on. Also part of T2: a Tideline-only Telegram bot (secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) for failed days and side-change alarms, tested with a real message. Done when the first scheduled day (5 Nov) freezes and anchors by itself |
| T3 | **Backfill 30–60 days** in Actions runs (for Q4, solvers, fee trace) | runtime | Days frozen, gaps shown, never filled in |
| T4 | **Realised cost.** Q3 spread and Follow the fee from realised swaps; PREREG.md with the not-blind statement | 5h | Cost parts sum within 0.5 bps, remainder shown (INV-4). Done 5 Nov: parts gap 0.00 bps; Q3 Bearish (spread 53.7 bps, top 3 77%) |
| T5 | **Elasticity on chain** by the §5 route the spike picks; E2 only if it fits | 8h | Elasticity outputs as SRS E1 defines them, or Q1 Not Measured with the reason |
| T6 | **Wire-up.** Readings, thesis text, method page, every page in Chrome at 1440 and 375 | 6h | V11 unit report rules |
| T7 | **P7.** Vercel, README, video | per workflow | G6 and G7 |

About 32 hours of work plus Actions runtime, which is tight but fits if T1 passes by 6 Nov.

## 6a. T1 results (4 Nov 2026, day 2026-11-03)

Three runs of `pipeline/chain_spike.mjs` in Actions (`spike.yml` on the `test` branch): 41781760546 (sample of 4,000), 41783958481 (sample of 2,000 plus solver census), 41790799455 (fee-account route, 52 weeks). Keyless FastNEAR and DefiLlama only.

| Measure | Result |
| --- | --- |
| Settlement transactions (signed by `intents.near`) | 90,684 on the day; listing takes 8 to 10 min (454 calls) |
| Free-tier pace | 1 call a second: 429 on 2% to 5% of calls (15 of 825, 115 of 2,972, 25 of 518), all recovered, no errors |
| Sample run (list + read 4,000) | **12 min.** Only 8% of settlement transactions hold a swap, so 4,000 give about 350 swaps |
| Sampled volume | $20M with a 95% interval of $1M to $39M (run 1), $20M with -$6M to $47M (run 2). One $300k swap in the sample carries most of it. **A sample can't pin daily volume down** |
| Solver census | Every transaction whose dip4 logs name one of the 17 solvers seen in the sample: 38,223 transactions, **7,722 token_diff swaps, $9.30M in** (97% of swaps priced). It holds 98.8% of the sample's token_diff swap transactions. Solvers picked from half the sample fill 94% of the other half's swaps (100% of their USD). **Not complete:** both checks only see swaps written as a token_diff with a referral. Swaps filled by plain dip4 transfers carry no referral and aren't counted; they likely sit in the census's other ~30,000 transactions. A private cross-check (not stored here) says the count is well short. Under check in a fourth run |
| Census run time | **45 min** without the full listing (5 min listing solvers, 38 min reading), 56 min with it. The solvers' accounts also appear in about 30,000 settlement transactions that are not swaps |
| Volume vs DefiLlama ($137.9M) | **Census ×0.067.** All token_diff ÷ 2 gives the same ($9.06M). DefiLlama's number is one value from NEAR's Dune dataset `dataset_near_intents_metrics.volume_amount_usd`, whose definition is not public. Transactions not signed by `intents.near` (35% of those sent to it in the first hour; signers `escrow.ai.near`, `bridge-mng.near`, `omni-relayer.bridge.near`) held no token_diff swaps (0 of 200). DefiLlama covers all Intents, not just 1Click, so it isn't the right yardstick for the 1Click count either |
| Prices | 97% of swaps priced (HOT tokens mapped from base58 addresses). Both sides of a swap agree within 5% on 99.9% of 3,396 checked swaps, median 0.9998, so ids and decimals are right. Unpriced: HOT TON tokens (`1117_`), `tron-` and `sol-` omft tokens |
| `1click-unknown` | 36% of swaps, 17% of USD (census) |
| App fee | A dip4 `transfer` from the swapping account on 81% of swaps; its rate is readable on 76%. `5880ad…` (AC-3.3) receives on 43% of swaps, at about 5 bps, across many referrals |
| Protocol fee | `fees_collected` on 99% of swaps, median 0.01 bps |
| Solvers | Found for 100% of census swaps. Top: `blockzen-1-main.near`, `solver-priv-liq.near`, `solver-multichain-asset.near`, `kipseli.near` |
| Referral mix (census USD) | LI.FI $2.85M, SwapKit $2.25M, unknown $1.57M, Rango $1.00M, Zodl $0.32M; 90 referrals |
| Fee-account route | Works and is cheap: 2 calls a week, a year of one account in about 2 min, history back to Nov 2025. **No clean fee-change event found.** SwapKit `trustswapkit.near` 70 bps every week for a year; LI.FI `fae85d…` 5 bps since Mar 2026; `2f09a4…` 70 bps with two one-week dips (noise). `dde5bb…`, `c4d748…`, `2da316…` are shared by several apps at different rates, so their weekly mode flips. One candidate: `dde5bb…` (SwapKit apps) mostly 20 → 10 bps around 17 to 24 Mar 2026, not clean |

**Run 4** (41797905924, `pipeline/chain_gap.mjs`): the missing swaps are transfer fills, almost all through one hub.

| Measure | Result |
| --- | --- |
| Hub | `51e8f94d…7cbe` sends transfers to and gets them from hundreds of accounts in the sample; it is in no token_diff. Census over the 17 solvers plus the hub: 66,999 transactions |
| Transfer swaps | **13,208 swaps, $24.96M** (an account sends tokens to a filler and gets a different token back, always across two transactions). 13,080 of them ($24.10M) through the hub |
| All swaps | token_diff 7,669 ($8.78M) + transfer 13,208 ($24.96M) = **20,877 swaps, $33.7M**. By size: $0–1k 17,821; $1k–10k 1,918; $10k–100k 509; $100k+ 52. A private cross-check (not stored here) agrees closely on count and size mix; USD is somewhat short in the largest swaps, where 577 unpriced swaps also sit |
| Referral | **Transfer swaps carry no referral**: 13,128 of them have no fee transfer in the census transactions, so no frontend can be named for about 63% of swaps and 74% of USD. Whether their fees show up elsewhere (fee accounts' own listings) isn't checked yet |
| Run time | 94 min (13 min listing fillers, 68 min reading). A daily job without the full settlement listing: about 80 min |

**Run 5** (41825809719, `pipeline/chain_attrib.mjs`): can transfer swaps be named? No. 300 accounts that swapped through the hub, each followed through all its transactions that day (most have 2 to 4): 79% pay no fee to anyone; 19% pay only `609214…`, a fee account shared by SwapKit, LI.FI and unknown swaps, so it names no one; 1% carry a referral (`1click-unknown`); none pay a single-referral fee account. The hub itself pays no fee accounts either. So on chain, **transfer swaps (about 63% of swaps, 74% of USD) can't be named to a frontend.** Any app fee on them, if there is one, isn't a visible transfer.

**Gate as written: not met.** But the count question is mostly answered: chain data finds about the right number of swaps and most of the USD. The open problem is naming the frontend for transfer swaps (Q4, Follow the fee). Decision in §7.

## 7. Decisions for the human

0. **T1 go/no-go (§6a).** Decided 4 Nov: go on the census of 17 solvers plus the hub (about 80 min a day in Actions). Run 5 shows transfer swaps can't be named to a frontend, so Q4 and Follow the fee by frontend read on the token_diff swaps only (about 37% of swaps, 26% of USD), and the site says so. Totals, size mix and solvers use all swaps.
1. **A paid FastNEAR key** would speed up backfill (and maybe allow full days instead of samples). The price is unknown. Judges wouldn't need it: the snapshot and the sampled hashes let them re-run at free speed. Recommended: no key unless T1 fails on speed alone.

## 8. Not sure yet

- Whether `1click-unknown` hides frontends other sources name. If so, Q4 and Q1 lose detail.
- Whether all fills appear as `token_diff`. Transfer-based fills also exist, which `solversOfSwap` handles.
- Whether FastNEAR's free limit is per IP, and how GitHub Actions fares against it.
- How well DefiLlama prices cover the long tail of `omft` and HOT tokens. Swaps with no price are counted and shown, never guessed.
