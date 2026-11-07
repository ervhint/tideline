# Tideline

Work in progress for NEAR HACKATHON, track Investment Thesis. A re-runnable investment thesis for NEAR built on NEAR Intents fee data.

Every number comes from public, keyless sources: `intents.near` logs on chain (FastNEAR and NEAR RPC), DefiLlama and `ft_metadata`. No API key is needed to re-run it.

## Headline finding: the flow is going private

The account that looked like the largest solver, `51e8f94d…7cbe`, is the Confidential Intents treasury. Funds sent to it move to FAR, a private chain, the swap settles there out of public view, and funds come back. It is a bridge, not a solver.

In the frozen chain days it carried about 1% of counted USD in mid October, 41% on 29 Oct and 97% on 5 Nov. An email from NEAR Intents (6 Nov 2026, the only source for this) says the private path becomes the main one on 9 Nov and public intents wind down later, with no date.

So a thesis built on public chain data is losing the data it reads. Tideline says so instead of reading what is left as if it were the whole market. Under PREREG.md amendment A2:

- Solver Competition and Largest Integrator read Not Measured once the treasury carries over 50% of their window (7 and 30 frozen days). Their public figures stay published as side figures.
- While either does, the verdict is held at Undecided whatever the score, so a loss of data can't move it. Without this rule, Solver Competition going Not Measured would have lifted the verdict to Bullish.
- Follow the Fee splits public swaps only. Treasury flow has its own line with the all-in cost, because any fee on it is hidden.
- A side measure, the confidential share, tracks funds going into the treasury from `data/treasury/`. It sets no reading and is not anchored on chain.

A2 is not blind: it was written after the shift and the published readings were known, and it says so.

Research only, not financial advice.
