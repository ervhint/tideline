# Tideline: agent rules

Re-runnable investment thesis for NEAR on NEAR Intents fee data, built from public chain data. Hackathon: NEAR HACKATHON, track `thesis`, deadline 2026-11-14T23:59Z.

- **Start here:** PROGRESS.md, then docs/PLAN.md (the build plan, units T0 to T7).
- Workflow: HACKATHON-WORKFLOW-V11-CURRENT.md. Design references are exact specs (rule 21). No Claude attribution on commits (rule 20). Web3 track, models per §9 and §10. Besides the website, only `npm test` and gitleaks run locally (rule 11). `npm test` and the Chrome tests of every page state at 1440px and 375px pass before every unit report. Claude in Chrome for all browser work, never the built-in browser pane or Playwright (rule 19). BFF architecture.
- Rules: HACKATHON.md; re-read the live copy before submitting.
- Docs: docs/PLAN.md (plan), docs/SRS.md (requirements; where it and the plan differ, the plan wins), docs/DESIGN.md, docs/TESTS.md. PROGRESS.md tracks progress.
- Repo: `ervhint/tideline` (private). The folder lives in OneDrive, so no git worktrees and no parallel writers.
- Contract: `tideline-thesis.testnet`, deployed 4 Nov 2026 (`contract/deployment.json`). Repo secrets `NEAR_ATTEST_ACCOUNT` and `NEAR_ATTEST_PRIVATE_KEY` sign the daily attest. The key never appears in chat or files.
- Dev server: `npx next dev -p 3112`.
- Explain results in plain language and flag anything uncertain.

## Data rule

The 1ClickSwap API Terms §4.1(e) forbid storing API data beyond 24 hours, and §17.6 keeps that rule after the terms end. So:
- **Never** call, store or commit data from the NEAR Intents Explorer API or the 1Click API (quotes, tokens, status). No partner JWT is needed or used.
- Sources: FastNEAR transactions API and NEAR RPC (`intents.near` dip4 logs), DefiLlama (volume, fees, revenue, prices, control venues), on-chain `ft_metadata`. All keyless.
- The schedules in `refresh.yml` and `attest-days.yml` stay off until T2 freezes the first chain day.

Never: commit secrets, sign or deploy on mainnet, make the repo public, post anywhere, or submit without the human's explicit yes. Every commit and every push, local commits included, needs the human's own command each time.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
