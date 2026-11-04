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

## Known for later units

Follow the Fee, Elasticity and Concentration, and the Method page's spot-check and coverage blocks, still show the prototype's sample text until T2 to T6 rebuild them from the chain sample. `data/published/model_inputs.json` is from 3 Nov; the refresh job updates it once its schedule is back (T2).

## Next

T1: spike, go or no-go (docs/PLAN.md §6), at Opus 5.5 · high. The 4 Nov chain measurements in PLAN §2 came from throwaway probe scripts; T1 writes them as real pipeline code. Decision waiting on the human: PLAN §7 (paid FastNEAR key, recommended no).
