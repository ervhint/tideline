**Not blind.** An earlier private analysis by the same author, on Intents Explorer data, estimated fee elasticity at -0.52 (95% interval -1.43 to 0.39) from 22 fee-change events. That result has been seen, so nothing below is pre-registered blind.

# Tideline: pre-registration

Written 5 Nov 2026, before any realised cost or spread was computed from the frozen chain days in `data/chain/`. The swap counts, USD totals and the token_diff to hub shift of 28 to 30 Oct (PROGRESS.md, T3) were already known when this was written.

Rules for this file:
- A section is frozen once it is committed. Changes are added at the end under "Amendments", with a date and a reason, and the old text stays.
- The code that computes a number cites the section it follows. Where code and this file differ, this file is the definition and the code is the bug.
- Sections 3 and 4 are written in T5, before any per-frontend volume around a fee change is read.

## 1. Data

- Swaps: the frozen chain days in `data/chain/<day>.jsonl`, one finished UTC day each, built by `pipeline/chain_day.mjs` from FastNEAR and NEAR RPC (keyless). A day is never changed after it is frozen. A day that could not be read is a gap, shown and never filled in.
- Two kinds of swap. **token_diff** swaps (`k: "d"`) carry a referral and a readable app fee. **Transfer** swaps (`k: "t"`) are filled by plain dip4 transfers, mostly through one hub account `51e8f94d…7cbe`, and carry no referral and no visible app fee.
- Prices: DefiLlama hourly prices, stored in each day file. A swap is priced when both its sides are. Unpriced swaps are counted and shown, never guessed.
- Size buckets by the USD of the side that is priced: $0–1k, $1k–10k, $10k–100k, $100k+.
- "The last 7 days" means the 7 most recent frozen days. A gap inside that span is not replaced by an older day; the reading uses the days it has and says how many.

## 2. Revenue figures

NEAR revenue, fees and volume come from DefiLlama (all Intents, not only 1Click). Since 23 Feb 2026 NEAR uses its captured Intents revenue to buy NEAR on the open market (DefiLlama methodology), so the buyback is taken to equal NEAR revenue.

## 3. E1 elasticity

Written in T5.

## 4. E2 pass-through

Written in T5.

## 5. E3 solver concentration

- Over the swaps of the last 7 days with a priced side, all kinds, each filler account's USD (the priced side, `vol`).
- A group whose solver field names several accounts joined by `+` splits its USD equally among them.
- The hub `51e8f94d…7cbe` counts as one filler account. The chain does not show whether it routes to several solvers behind it, so the top-3 share is also published with token_diff swaps only, as a side figure. The side figure does not set the reading.
- Published per size bucket and for all sizes: HHI (0 to 10,000) and the top-3 share (0 to 1). The all-sizes figure pools USD across buckets.

## 6. The five readings and the verdict

As coded in `analysis/readings.mjs`. Exactly on a line is Neutral. Missing data is Not Measured.

| Reading | Bullish | Bearish | Otherwise |
| --- | --- | --- | --- |
| Q1 pricing power | E1 interval entirely above -1 | E1 interval entirely below -1 | Neutral. Not Measured with fewer than 3 usable events |
| Q2 NEAR's share of fees | 30-day capture (DefiLlama revenue ÷ fees) above 30% | Capture under 20% on each of the last 14 days | Neutral |
| Q3 solver competition | Spread (section 8) under 5 bps **and** top-3 share (section 5, all sizes) under 60% | Spread over 10 bps **or** top-3 share over 80% | Neutral. Not Measured if either number is missing |
| Q4 largest integrator | Largest referral's 30-day fee share under 50% | Over 80% | Neutral |
| Q5 path to deflation | 90-day DefiLlama revenue rose at each of the last 3 month-ends | Fell at each | Neutral |

Verdict: Bullish +1, Bearish -1, Q1 and Q5 count double. Three or more Not Measured is Undecided. Otherwise +3 or more is Bullish, -3 or less is Bearish, anything between is Undecided.

## 7. Follow the fee: the cost parts of a realised swap

For a set of swap groups (one size bucket over the last 7 days, all kinds unless said):
- Only groups with both sides priced (`np > 0`) and a readable app fee count. token_diff groups with `fee: null` (the fee was paid in a token the swap did not give) are left out and counted. Transfer swaps count with an app fee of 0, because none is visible on chain.
- **Price check.** A group whose USD out ÷ USD in is under 0.8 or over 1.25 is left out as a likely price or decimals error, and counted with its USD. No other trimming.
- For each group: `in` and `out` are the summed USD of the priced swaps. The app fee is a separate transfer, so the user's gross input is `gross = in ÷ (1 − fee/10,000)` and the app fee in USD is `gross − in`.
- **All-in cost** = (Σ gross − Σ out) ÷ Σ gross, in bps.
- **App fee** = Σ (gross − in) ÷ Σ gross.
- **Protocol fee** = the `intents.near` `fee()` rate (1 pip = 0.01 bps, `data/snapshot/protocol_fee.json`) times the token_diff share of Σ gross. Transfer swaps pay no protocol fee.
- **Solver spread and price noise** = all-in − app fee − protocol fee. It is what the filler kept plus any price movement within the hour, since prices are hourly. It is shown as the unexplained rest, never hidden (INV-4). The parts add up to the all-in cost by construction; the published check is that the rounded parts sum to the rounded all-in within 0.5 bps.
- **Withdraw fee**: paid outside `intents.near` when funds leave, so it is not in these swaps. Shown as not measured here.
- **NEAR revenue** and **buyback**: DefiLlama revenue ÷ DefiLlama volume over the 30 days in `data/published/model_inputs.json` (the repo keeps no daily DefiLlama volume, so a 7-day figure can't be rebuilt), in bps of volume. They are part of the app fee and protocol fee, not on top of them, and they cover all Intents.
- Routes: a day file keeps swap counts and USD per route but no USD out per route, so the cost split is by size bucket and swap kind, not by route.

## 8. Q3 spread

- Bucket $1k–10k, the last 7 days, all kinds, with the inclusion rules and price check of section 7.
- For each day: the solver spread and price noise of section 7 over that day's groups. A day with fewer than 30 priced swaps in the bucket is skipped.
- The Q3 spread is the median of the daily values. Fewer than 5 usable days gives Not Measured.
- Small spreads read less precisely than with minute prices. A negative daily spread (users got more than the hourly price says) is kept as it is.

## Amendments

None yet.
