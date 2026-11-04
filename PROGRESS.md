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

## T2 daily chain snapshot: built, first real day not run yet (4 Nov 2026)

- `pipeline/chain_day.mjs` freezes one finished UTC day as `data/chain/<day>.jsonl`: fillers carried forward in `data/chain/fillers.json` (only grows; a seeded sample of settlement transactions looks for new ones once a week or with DISCOVER=1), census of every transaction naming a filler, token_diff swaps plus transfer swaps, priced hourly from DefiLlama. The file holds swaps grouped by kind × solver × referral × app fee × size bucket, routes, and the decimals and prices used. No wallet addresses. Same inputs give the same bytes.
- A day is written once, never changed. It stays a gap (the run fails, nothing is written) if a listing was cut short, under 99% of the listed transactions were read, or no swaps were found. A day freezes 2 hours after it ends.
- `pipeline/build_chain_days.mjs` writes `data/published/chain_days.json` (per-day totals, token_diff share of swaps and USD, unpriced swaps, gaps) and fails on a damaged day file. `verify` rebuilds it with no network (3 files, 96 values). `snapshotLastDay` in `thesis.json` now reads the last frozen chain day, so the Data Is Late banner clears once one exists. Q4 and the solver columns still read the old `data/snapshot/days` and stay Not Measured until T3 to T6.
- `attest:check`, `attest:send` and the site's Reproduce page now read `data/chain/` (env `CHAIN_DIR`) instead of `data/quotes/`.
- `chain-day.yml`: by hand only, inputs day, commit (default off, then it uploads the files as an artifact) and discover. The schedule stays off. About 80 to 95 min.
- Tests: `npm test` 156/156, `tsc --noEmit` clean. The census itself ran only against a fake chain; the first real run is the next step. gitleaks flags only the gitignored `.next` dev cache.
- Uncertain: swaps are token_diff entries with a referral plus transfer swaps, as measured in T1. Direct token_diff swaps with no referral, if any, are not counted. A filler found on day D is read from D on; earlier days keep the list they were frozen with (each file names it).

## Next

T2 first real day: run `chain-day` on `test` for 2026-11-03 with commit off, check the counts against T1 (about 20,900 swaps, $33.7M), then run it with commit on, `attest:send` the day, and `attest:check` must say MATCH. Then turn the schedule on. T3 backfills 30 to 60 days. Still open from PLAN §7: a paid FastNEAR key, recommended no.
