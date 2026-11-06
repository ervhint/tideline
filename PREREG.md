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

Written 5 Nov 2026 (T5), before any fee-change event was looked for in the frozen chain days and before any per-frontend volume around a change was read. The window lengths below were chosen from the length of the data alone (32 frozen days, 4 Oct to 4 Nov 2026), not from the fee rates.

**Route.** docs/PLAN.md §5 names two routes. The fee-account route was tried in T1 (run 41790799455) on six fee accounts over a year and found no clean fee change (PLAN §6a), so it gives no events. E1 uses the frozen chain days, which hold every token_diff swap of each day, not a sample.

**Events (fee rates and swap counts only, no USD).**
- A frontend is a referral on token_diff swaps (`k: "d"`). `1click-unknown` and a blank referral are not frontends and give no events. Transfer swaps carry no referral and are not used.
- A swap group's fee rate is its `fee` rounded to the nearest whole bps. Groups with `fee: null` are left out of the census.
- **Daily fee**: on a day with at least 10 token_diff swaps for the frontend, the rounded fee rate with the most swaps, if it covers at least 70% of the frontend's swaps with a fee that day. Otherwise the day has no daily fee.
- **Stable run**: consecutive days with a daily fee, all the same rate. Days without a daily fee are skipped, not counted, and do not break a run.
- **Event**: two neighbouring stable runs of at least 7 days each, with rates at least 5 bps apart, where the first day after is at most 7 calendar days after the last day before. `from` is the first run's rate, `to` the second's.
- Every rate step in the census, of any size or length, counts as a **change** for the "no other change of its own" and control rules below, even when it is not an event.
- The event list is written to `data/published/elasticity.json` with the census that made it. If no event passes, Q1 reads Not Measured with that reason and nothing below runs.

**Left-out days.** 4 Oct 2026, the last day of the 1 to 4 Oct exploit pause, is left out of every window. Days missing from `data/chain/` (gaps) are left out too.

**Windows.** 7 days before (ending on the last day before) and 7 days after (starting on the first day after). A window needs at least 4 days left after the left-out days. The frontend must have no other change of its own touching either window or the days between.

**Outcome.** USD is the priced side (`vol`) of the frontend's token_diff swaps, all sizes.
- `dv` = ln(mean daily USD after ÷ mean daily USD before) for the frontend, minus the same for the **control**: all other token_diff referral USD that day (including `1click-unknown` and the blank referral), leaving out any frontend with a change of its own inside the windows.
- `df` = ln((to + 5) ÷ (from + 5)), the fee change with a 5 bps shift so a 0 bps rate has a log.
- An event is **usable** when both windows are long enough, the frontend has at least $50,000 in the before window, some volume after, and at least one placebo date.

**Estimate.**
- E1 = slope through zero of `dv` on `df` across usable events. At −1 a higher fee leaves revenue flat.
- **Placebo dates**: for each event, every other date on the same frontend with the same gap between windows, both windows long enough, volume in both and no change of its own touching them. 10,000 draws, seed 20261101: each draw swaps every event's `dv` for one of its placebo dates' `dv` at random and takes the slope.
- **Interval**: estimate ± the 95th percentile of the absolute placebo slopes. p = (placebo slopes at least as far from 0 as the estimate + 1) ÷ (draws + 1). **MDE** = 2.8 × the placebo slopes' standard deviation.
- **Underpowered** when the interval spans 0 or |estimate| < MDE. Then the page's first line says so (AC-5.3).
- With fewer than 3 usable events there is no E1 and **Q1 reads Not Measured** (section 6, SRS D2). The page states the count and the fee trace and threshold stay the lead (AC-5.4).

**Checks**, each a full run of its own, published beside the main result; none sets the reading:
- Drop the frontend with the most before-window USD.
- Fee shift 2 bps and 10 bps instead of 5.
- Leave out events whose windows touch 28 to 30 Oct 2026, when flow moved from token_diff swaps to the hub (PROGRESS.md, T3).
- CoW Swap's DefiLlama daily volume as the control instead of the other frontends, and the same for each venue in `data/snapshot/control_venues.json`. A day the venue lacks makes the window unusable.

**Limits, said on the page.** 32 days allow few events and few placebo dates, so an underpowered result is likely. token_diff swaps are a shrinking part of the flow after 28 Oct. A frontend's fee rate on chain is a transfer ÷ swap amount, so it is read to the nearest bps, not exactly.

## 4. E2 pass-through

Written 5 Nov 2026 (T5), with section 3 and before any cost around a fee change was read.

- Same usable events, windows, placebo dates, draws and interval rules as section 3, with seed 20261102.
- For each window: the frontend's **all-in cost** in bps, by section 7's rules (priced groups with a readable fee, the price check, gross = in ÷ (1 − fee/10,000)), all sizes. A side figure uses the $1k–10k bucket only, seed 20261103.
- `dcost` = all-in cost after − before. E2 = slope through zero of `dcost` on `to − from` (bps). 1 means users paid all of the fee change; 0 means someone else absorbed it.
- An event or placebo date with no priced swaps in a window has no `dcost` and is left out of E2 only. With fewer than 3 events left there is no E2.
- Prices are DefiLlama hourly (section 1), so the price noise of section 7 sits in both windows.

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

### A1. Q4 on chain days (5 Nov 2026, T6)

Written before any fee share per referral was computed from the frozen chain days. Section 6 says "largest referral's 30-day fee share" but not how to read it on chain; this fills that in and changes nothing above. Known when written: per-referral USD volume for 3 Nov from T1 (LI.FI, SwapKit, `1click-unknown` and Rango largest), and that transfer swaps carry no referral (PLAN §6a, run 5).

- **Days**: the last 30 frozen days. A gap is not replaced by an older day; the reading says how many days it used.
- **Swaps**: token_diff groups (`k: "d"`) only. Transfer swaps show no app fee and no referral, so they are not in Q4. The page says how much of the window's USD the token_diff swaps carry.
- **Fee paid** per group: `vol × fee ÷ (10,000 − fee)`, the app fee on the gross input by section 7's rule, with `vol` (the priced side) so groups with one priced side count. Groups with `fee: null` are left out and counted with their USD. Groups with no priced side add nothing.
- **Integrator**: each referral string on its own, as `data/labels/frontends.json` keys them. `1click-unknown` and the blank referral stay in the total but cannot be the largest, because neither is one frontend. Side figure, which does not set the reading: the same share with both left out of the total too.
- **Q4 share** = the largest integrator's fee paid ÷ all fee paid over the window. Sides as in section 6.
- **By size** (Concentration page): the same rule inside each size bucket. Does not set the reading.

### A2. The hub is the Confidential Intents treasury (6 Nov 2026, T6b)

Written before Q3, E3 or Q4 was computed under these rules. This one is not blind. Known when written: the treasury's share of counted USD per day (about 1% in mid October, 41% on 29 Oct, 97% on 5 Nov); the published readings up to 5 Nov (Q3 Bearish, spread 59.9 bps, top 3 80%; Q4 SwapKit 75%; verdict Undecided, score +2); the T4 token_diff side figures (13.5 bps, top 3 67%); and that under section 6 alone, Q3 going Not Measured would lift the score to +3 and the verdict to Bullish. Rule 5 exists because of that last fact: it stops a loss of data from moving the verdict.

**What changed.** docs.near-intents.org (market-makers/confidential-intents, read 6 Nov 2026) names `51e8f94d…7cbe` as the Confidential Intents treasury. A transfer to it on `intents.near` moves funds to FAR, a private chain, and the swap settles there, out of public view; a transfer from it moves funds back. On chain, 118 of 118 sampled transfers in carried an encrypted memo and 0 of 119 out did. So it is a bridge, not a solver, and a transfer swap through it is the public edge of a private swap. An email from NEAR Intents (6 Nov 2026) says this path becomes the main one on 9 Nov 2026 and public intents wind down later, with no date yet. The email is the only source for those two points. Sections 1 and 5 stay as written; where they call this account a hub or a filler, this amendment replaces them.

1. **Treasury share.** Over a window of frozen days: USD (`vol`) of groups whose solver is the treasury ÷ USD of all groups. Treasury pairs undercount the flow (rule 7), so this share reads low, not high.
2. **E3 and the Q3 spread.** Groups whose solver is the treasury are left out of section 5 and section 8. The other rules there stand. The figure with the treasury as one account is no longer published.
3. **Private flow line.** Q3 reads Not Measured when the treasury share of its last 7 days is over 50%. Q4 reads Not Measured when the treasury share of its last 30 days is over 50%. Exactly 50% is not over. The detail names the share, for example "Flow went private: treasury 94% of USD".
4. **Side figures.** Under rule 3 the spread, top-3 share and Q4 share are still computed and published on the public swaps that remain, marked as side figures. They do not set a reading. Section 8's minimum days still applies to the spread.
5. **Verdict hold.** While Q3 or Q4 is Not Measured under rule 3, the verdict is Undecided, whatever the score. The score is still published, and the page gives this reason. Otherwise section 6 stands. If the share falls back to 50% or less, the reading and the verdict return by themselves.
6. **Cost parts.** Section 7's split into app fee, protocol fee and spread applies to public swaps only. Treasury groups are reported on their own line as the confidential path, with the all-in cost only. Any fee on that path is hidden on FAR, so their cost is not called app fee or solver spread, and their app fee is not read as 0.
7. **Swap counts.** A treasury pair is an account that sends one token in and gets a different one back on the same UTC day. Private swaps that return to another account, or on another day, are not paired. One 30-minute sample on 6 Nov found about 20% of non-filler USD in was paired inside the window; that sample is rough and sets nothing. Pages call these paired confidential flows and do not present them as a full swap count.
8. **Confidential share (side measure, sets no reading).** Per finished UTC day, every dip4 transfer to or from the treasury on `intents.near`, summed by token and direction, with listed fillers and other accounts kept apart. USD uses DefiLlama hourly prices; unpriced amounts are counted, never guessed. Files are new, one per day, and hold no wallet addresses; a frozen file in `data/chain/` is not changed. Back to 4 Oct 2026, using the filler list of each day's file. A day that can't be read is a gap. **Confidential share** = other accounts' USD into the treasury ÷ (that + USD of all groups whose solver is not the treasury).
9. **Unchanged.** Q1, Q2, Q5, the V* model and every line in section 6 not named here. E1 and E2 keep reading token_diff swaps only.
