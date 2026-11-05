# Tideline progress

## T0 repo and rename: done (4 Nov 2026)

- Private repo `ervhint/tideline`, branch `main`. gitleaks pre-commit hook in `.git/hooks/pre-commit` (hooks are not committed; set it up again on a new clone). `test.yml` runs npm test, verify, the build and a gitleaks scan of the full history on every push.
- No script calls the Explorer API, the 1Click API or Binance (AGENTS.md data rule). `.env.example` has no Explorer key.
- Site, contract crate (`tideline-attest`, wasm `tideline_attest.wasm`, event standard `tideline_attest`), workflows and links all say Tideline. Nav wordmark keeps the reference's font, size and `--sx` 0.894, with the placeholder mark.
- `build_thesis` runs on DefiLlama and the model inputs alone. A reading whose input is missing is Not Measured. As of 3 Nov data: Q2 Bullish (35%), Q5 Neutral, Q1/Q3/Q4 Not Measured, verdict Undecided, V* $12.27B at 1.6% issuance (3.1x today).
- `verify` checks `thesis.json` and `reconciliation.json` (ALL OK, 92 values). Elasticity, fee trace and token board come back with T2 to T5. `refresh` pulls DefiLlama and the model inputs and rebuilds those two files.
- `fee_account.json` built from NEAR RPC (keyless).
- "Data Is Late" banner reads the last frozen chain day only. It shows on every page until T2 freezes the first day.
- Contract deployed to `tideline-thesis.testnet` by `contract-deploy` run 41770683929, transaction `HrUvseYRMnmtvLiJneAQGHq72EZiTEtNP2UbJzAw6ZVt`. Read back over RPC: owner `tideline-thesis.testnet`, `last_day` null, code hash `DhbqJJQp…tiZR` equals the wasm's sha256 `bcb2dc68…3d94`. Details in `contract/deployment.json`. The Reproduce page reads it: "Not Yet Anchored".
- Tests: `npm test` 128/128, `tsc --noEmit` clean, gitleaks clean. Chrome: all 8 pages and their preview states at 1440 and 375, no console errors, no sideways scroll. GitHub Actions `test` and `contract` passed on main.
- History squashed into one commit on 4 Nov 2026 (human's yes), so the repo starts clean before it goes public.
- docs/TESTS.md results reset to "not run"; each unit records its own.

## T1 spike: measured, go on the census (4 Nov 2026)

- `analysis/chain_swaps.mjs` (pure: token_diff swaps, transfers, withdrawals, transfer swaps across transactions, app fees, token ids to DefiLlama ids including HOT base58, USD, seeded sample, extrapolation) with tests. `pipeline/chain_io.mjs` (FastNEAR at one call a second, archival RPC, block at a time, price book). Spike scripts `chain_spike.mjs` (runs 1 to 3), `chain_gap.mjs` (run 4), `chain_attrib.mjs` (run 5), started by `spike.yml` on pushes to `test`. `events` exported from `analysis/solvers.mjs`.
- Four Actions runs on `test` for 3 Nov; numbers in docs/PLAN.md §6a. In short: a 4% sample can't pin volume; swaps come in two kinds, token_diff (7,669, $8.78M, with a referral) and transfer fills through one hub `51e8f94d…` (13,208, $24.96M, no referral), so 20,877 swaps, $33.7M in all, and a private cross-check agrees closely on count and size mix. The census of 17 solvers plus the hub takes about 80 to 94 min a day. DefiLlama's $137.9M covers all Intents, not a yardstick. Prices check out (99.9% of swaps agree within 5%). The fee-account route works but found no clean fee-change event, so Q1 likely reads Not Measured.
- Gate as written not met; the human chose to go on the census (4 Nov).
- Run 5 (41825809719): transfer swaps can't be named to a frontend. Of 300 hub users followed, 79% pay no fee to anyone, 19% pay only the shared fee account `609214…`, 1% carry a referral. So frontend readings (Q4, Follow the fee by frontend) use token_diff swaps only. `chain_io.mjs` RPC now waits 250 ms between calls and tries 10 times (the first run 5 attempt died on an RPC 429 after an outage).
- Spike runs push only to `test` (the human's yes, 4 Nov), built as commits off `main` without touching it.

## Known for later units

Follow the Fee, Elasticity and Concentration, and the Method page's spot-check and coverage blocks, still show the prototype's sample text until T2 to T6 rebuild them from the chain sample. `data/published/model_inputs.json` is from 3 Nov; the refresh job updates it once its schedule is back (T2).

## T2 daily chain snapshot: first day frozen and anchored (4 Nov 2026)

- `pipeline/chain_day.mjs` freezes one finished UTC day as `data/chain/<day>.jsonl`: fillers carried forward in `data/chain/fillers.json` (only grows; a seeded sample of settlement transactions looks for new ones once a week or with DISCOVER=1), census of every transaction naming a filler, token_diff swaps plus transfer swaps, priced hourly from DefiLlama. The file holds swaps grouped by kind × solver × referral × app fee × size bucket, routes, and the decimals and prices used. No wallet addresses. Same inputs give the same bytes.
- A day is written once, never changed. It stays a gap (the run fails, nothing is written) if a listing was cut short, under 99% of the listed transactions were read, or no swaps were found. A day freezes 2 hours after it ends.
- `pipeline/build_chain_days.mjs` writes `data/published/chain_days.json` (per-day totals, token_diff share of swaps and USD, unpriced swaps, gaps) and fails on a damaged day file. `verify` rebuilds it with no network (3 files, 96 values). `snapshotLastDay` in `thesis.json` now reads the last frozen chain day, so the Data Is Late banner clears once one exists. Q4 and the solver columns still read the old `data/snapshot/days` and stay Not Measured until T3 to T6.
- `attest:check`, `attest:send` and the site's Reproduce page now read `data/chain/` (env `CHAIN_DIR`) instead of `data/quotes/`.
- `chain-day.yml`: by hand only, inputs day, commit (default off, then it uploads the files as an artifact) and discover. The schedule stays off. About 80 to 95 min.
- First real day: chain-day run 41837332718 for 2026-11-03: 20,925 swaps (7,717 token_diff, 13,208 transfer), $34.2M, 67,199 census transactions, 19 fillers, 1h34m; close to T1. Frozen as `data/chain/2026-11-03.jsonl` (sha256 `d0c30363…6973`), anchored on `tideline-thesis.testnet` by attest-days run 41857233332; the site reads `anchored` with equal hashes. On main as fff407b.
- Solver field: 35% of token_diff swaps have several solvers joined with `+` (30 distinct accounts); T4 splits them. 117 token_diff swaps ($0.22M) were filled by solvers outside the filler list.
- Tests: `npm test` 157/157, `tsc --noEmit` clean, `verify` ALL OK (132 values). gitleaks flags only the gitignored `.next` dev cache.
- Uncertain: swaps are token_diff entries with a referral plus transfer swaps, as measured in T1. Direct token_diff swaps with no referral, if any, are not counted. A filler found on day D is read from D on; earlier days keep the list they were frozen with (each file names it).

## T3 backfill: done (5 Nov 2026)

- `pipeline/backfill_plan.mjs` (+ test) cuts a run of days into jobs of 3 days (a day takes about 95 min, a job may run 6 h). `chain-backfill.yml`: by hand, inputs from, to, commit (default off); at most 6 jobs at once; a last job copies every frozen day in (never replaces one), rebuilds the derived files, runs `npm run verify`, commits once if `commit` is on. Every day uses the committed filler list as it is (no discovery), so a solver that left earlier can be missed on old days. A day that can't be read stays a gap. Plan for the full run: 30 days, 4 Oct to 2 Nov = 10 jobs (human chose 30 days, 6 at a time).
- Built on branch `test` (commits c2d8279, c449b66; `test` was force-pushed over the old spike history with the human's yes). GitHub starts a hand-run workflow only from `main`, so the trial ran through a temporary push trigger on `test`; that trigger is removed (5 Nov) and the workflow goes to `main` for the full run.
- Trial passed (run 41868179837, 4 to 6 Oct, nothing committed, files only in the run artifact): all census transactions read, no gaps. 4 Oct 18,165 swaps $18.6M; 5 Oct 22,832 $37.3M; 6 Oct 22,668 $32.2M; each day 31 to 57 min of reading (43, 83, 124 429s), whole job 2h10m. FastNEAR and DefiLlama reach back at least to 4 Oct.
- Finding for T4/T5/T6: in early October 99.4% to 99.8% of swaps are token_diff (about 18k to 23k a day) and transfer swaps only 48 to 108 a day; on 3 Nov token_diff is 37% of swaps and the hub carries 63%. Totals per day stay about the same, so flow likely moved from token_diff to the hub somewhere between 6 Oct and 3 Nov. Not confirmed; the 30 days show when. Frontend readings use token_diff only, so they cover far less of the flow after the shift.
- Mistake to remember: the force-push to `test` also started a `spike` run (the push counted the spike files as changed). Cancelled.
- Full run: chain-backfill run 41966249656 (from main, 4 Oct to 2 Nov, 10 jobs, 6 at a time, about 7 h), committed as ea76853. With 3 Nov (T2) and 4 Nov (by hand, below) `data/chain/` holds **32 frozen days, 2026-10-04 to 2026-11-04, no gaps**; every day read all its listed census transactions. Swaps per day 13.8k to 31.5k, USD per day $18.6M to $63.4M.
- The token_diff to hub shift happened on 28 to 30 Oct: transfer swaps 48 to 541 a day until 27 Oct, 954 on 28 Oct, 4,514 on 29 Oct, 6k to 10k from 30 Oct to 2 Nov, 13,208 on 3 Nov, 17,746 on 4 Nov (token_diff that day only 2,071). Frontend readings (token_diff only) cover a shrinking part of the flow from 29 Oct.
- Re-running a day does not give the same bytes. The trial and the full run both froze 4 to 6 Oct: same transactions, swap counts and census digests, but DefiLlama served slightly different hourly prices for a few small tokens the second time, so USD moved by 0.0001% to 0.0012% and the file hashes differ. `verify` is unaffected (each file keeps its prices); the method page (T6) must say a re-run from scratch matches the counts, not the hash.
- Not explained yet (T4 checks it before relying on exact counts): on 4 days more transactions were read than listed: 10 Oct 42,400 of 42,399, 27 Oct 32,806 of 32,805, 31 Oct 45,167 of 45,161, 3 Nov 67,200 of 67,199. Possibly a few transactions counted twice.

## Repo public (5 Nov 2026, human's yes)

- `ervhint/tideline` is public since about 07:20 UTC 5 Nov, so Actions minutes cost nothing from then on. Why: the account is on the Free plan (2,000 minutes a month shared by all private repos; 1,503 used by 02:50 UTC 5 Nov, before the backfill), and one chain day takes 45 to 90 minutes, so the daily job alone would not fit. Before switching: gitleaks over the full history clean, no Explorer or 1Click data ever committed, no other project's name anywhere. Commit author emails are visible (the human knows).
- Commits made with a Claude attribution line (against rule 20) were reworded: `main` 8480491 became fbbc14b with the same content, and `test` was force-pushed to the same commit. Both force-pushes had the human's yes.
- Still needed before submission: a LICENSE file (HACKATHON.md Q-014).

## T2: daily freeze works by hand; the schedule is not proven (5 Nov 2026)

- GitHub created no scheduled run of chain-day (03:17 UTC 5 Nov) or attest-days (05:41) at all, and refresh (hourly) ran only 3 times on 5 Nov. Our setup checks out (workflows active, cron lines valid, on the default branch, GitHub status operational), so GitHub is dropping most of our scheduled runs. Not provable from our side.
- b055627: chain-day has four slots, 03:17, 05:17, 07:17, 09:17 UTC (10:17, 12:17, 14:17, 16:17 WIB); a frozen day exits in seconds. Its commit step now starts again from the branch when another run pushed first. The 09:17 slot on 5 Nov did not fire either.
- 2026-11-04 frozen by hand: chain-day run 41986747844, 19,817 swaps, $39.1M, 113,495 census transactions (the most so far), committed as c26d47e.
- Anchoring: `FIRST_DAY_WITH_READINGS` moved to 2026-11-03, so 2 Nov (reached by the backfill on 5 Nov) carries the hash only, like the other late days. The 31 new days (4 Oct to 2 Nov, 4 Nov) were anchored by hand: attest-days run 42021415887 sent 31; a dry run after it (42021934003) reads all 32 days back from `tideline-thesis.testnet` as "already recorded, matches".
- Test fix (c3cd1dc): the Data Is Late test pinned the last frozen day to 2026-11-03 and broke once 4 Nov froze; it now only checks thesis.json against `data/chain`. Commit 1fe16fc was pushed with that test failing (a chained command); CI shows it red and c3cd1dc green.

## Next

- **6 Nov, 13:00 WIB:** `gh run list --workflow chain-day.yml`. If a scheduled run froze 2026-11-05 by itself, T2 is closed: write "T2 closed" with the date. If not yet, check again at 19:00 WIB (the last slot is 16:17 WIB, a run takes 1.5 to 2 h). If no slot fired all day, GitHub's scheduler can't be relied on: start the daily run from outside instead (a free cron service or Supabase cron calling the workflow_dispatch API with a token limited to Actions on this repo), with the human's yes. Freeze 2026-11-05 by hand then too.
- **Then T4** in a new chat: read the PLAN T4 row, `data/chain/*.jsonl`, `data/published/chain_days.json`, and the two T3 notes above (the hub shift, read above listed).
- Still open from PLAN §7: a paid FastNEAR key, recommended no.
