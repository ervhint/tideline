// S2 view of the realised fee trace (T4, PREREG.md section 7 and amendment A2 rule 6). Pure and type-annotations only, so Node can run it directly (tests) and the site can import it.
type Left = { notBothPriced: { swaps: number }; feeUnreadable: { swaps: number; usd: number }; priceCheck: { swaps: number; usd: number } };
export type CostParts = {
  groups: number; swaps: number; grossUsd: number; outUsd: number;
  allInBps: number | null; appFeeBps: number | null; protocolBps: number | null; spreadBps: number | null; partsGapBps: number | null; left: Left;
};
// The confidential path has an all-in cost only: any fee on it is hidden, so it has no app fee or spread to show.
type Confidential = { swaps: number; inUsd: number; allInBps: number | null };
type ByKind = { all: CostParts; tokenDiff: CostParts; transfer: CostParts; confidential?: Confidential };
export type FeeTrace = {
  from: string; to: string; days: number; gapsInWindow: number;
  protocolFee?: { bps: number; collector: string };
  trace: { days: string[]; bySize: Record<string, ByKind>; allSizes: ByKind };
  nearRevenue?: { bps: number; from: string; to: string };
  query?: string;
};
const SIZE = 10000;
const bucketOf = (usd: number) => (usd < 1000 ? '0-1k' : usd < 10000 ? '1k-10k' : usd < 100000 ? '10k-100k' : '100k+');
const BUCKET_NAME: Record<string, string> = { '0-1k': '$0 to $1k', '1k-10k': '$1k to $10k', '10k-100k': '$10k to $100k', '100k+': 'over $100k' };

const usd = (v: number) => (Math.abs(v) < 0.005 ? '< $0.01' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`);
const bps = (v: number) => `${v.toFixed(1)} bps`;
const int = (n: number) => n.toLocaleString('en-US');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// S2: what a $10,000 swap costs, from the realised swaps of the last frozen chain days. Falls back to the sample if the file is missing.
export function feeView<S extends object>(trace: FeeTrace | null, sampleFee: S) {
  const bucket = bucketOf(SIZE);
  const k = trace?.trace?.bySize[bucket];
  const g = k?.all;
  if (!trace || !g || g.allInBps == null || g.appFeeBps == null || g.protocolBps == null || g.spreadBps == null) {
    return { ...sampleFee, live: false as const, spreadNote: 'About $0.30 Outside the App Fee', spreadSub: 'Solver spread $0.30 and protocol fee under $0.01', explain: 'A $10,000 swap from ETH to USDC costs $20.30. That is 20.3 bps more than the outside price, measured against the Binance mid at the quote time.', query: 'Sample from the draft, to be re-run.', asOf: null as string | null };
  }
  const d = (b: number) => (b / 1e4) * SIZE;
  const span = `${dayName(trace.from)} to ${dayName(trace.to)}`;
  const size = BUCKET_NAME[bucket];
  const plainShare = g.grossUsd ? k.transfer.grossUsd / g.grossUsd : 0;
  const td = k.tokenDiff, plain = k.transfer, conf = k.confidential;
  const confShare = conf && g.grossUsd + conf.inUsd ? conf.inUsd / (g.grossUsd + conf.inUsd) : 0;
  const left = g.left;
  const near = trace.nearRevenue;
  const gap = trace.gapsInWindow ? ` ${trace.gapsInWindow} day${trace.gapsInWindow === 1 ? '' : 's'} in this span could not be read and ${trace.gapsInWindow === 1 ? 'is' : 'are'} left out.` : '';
  return {
    live: true as const,
    total: usd(d(g.allInBps)),
    lead: `${usd(d(g.allInBps))} in total, ${bps(g.allInBps)} of what goes in, from ${int(g.swaps)} real public swaps of ${size} on chain, ${span}.`,
    spreadNote: `${usd(d(g.protocolBps) + d(g.spreadBps))} Outside the App Fee`,
    spreadSub: `Protocol fee ${usd(d(g.protocolBps))} and solver spread with price noise ${usd(d(g.spreadBps))}`,
    // share = weight in the bar; minPx keeps a tiny part visible (the bar is not to scale for small parts).
    parts: [
      { key: 'app', value: usd(d(g.appFeeBps)), name: `App Fee, ${bps(g.appFeeBps)}`, share: Math.max(g.appFeeBps, 0), minPx: 0, text: `The fee a frontend takes, read on chain as a separate transfer from the user to a fee account. Only token_diff swaps show it (${td.appFeeBps != null ? bps(td.appFeeBps) : 'none'} on those). Plain transfer swaps, ${pct(plainShare)} of this public USD, show none, so any fee they charge sits in the rest below.` },
      { key: 'withdraw', value: '—', name: 'Withdraw Fee, Not in These Swaps', share: 0, minPx: 0, text: 'Paid when funds leave intents.near for another chain, outside the swap itself, so the chain swaps here do not hold it.' },
      { key: 'protocol', value: usd(d(g.protocolBps)), name: `Protocol Fee, ${g.protocolBps.toFixed(2)} bps`, share: Math.max(g.protocolBps, 0), minPx: 2, text: `Charged by the intents.near contract on token_diff swaps: fee() is 1 pip, which is 0.01 bps, and it has not moved since January 2026. It goes to the contract's fee collector${trace.protocolFee ? `, account ${trace.protocolFee.collector.slice(0, 8)}…${trace.protocolFee.collector.slice(-4)}` : ''}. Plain transfer swaps pay none.` },
      { key: 'unexplained', value: usd(d(g.spreadBps)), name: `Solver Spread, Unexplained Rest, ${bps(g.spreadBps)}`, share: Math.max(g.spreadBps, 0), minPx: 2, text: `What is left after the fees above: what the solver kept, any fee charged inside its price, and price movement within the hour (prices are hourly). On token_diff swaps alone it is ${td.spreadBps != null ? bps(td.spreadBps) : 'not measured'}; on plain transfer swaps ${plain.spreadBps != null ? bps(plain.spreadBps) : 'not measured'}. Shown, never hidden.` },
      ...(conf?.allInBps != null
        ? [{ key: 'confidential', value: bps(conf.allInBps), name: 'Confidential Path, Reported Apart', share: 0, minPx: 0, text: `Not in the split above. Funds go to the Confidential Intents treasury, the swap settles on a private chain, and funds come back. From the two public edges, ${int(conf.swaps)} paired confidential flows of ${size} cost ${bps(conf.allInBps)} all-in; they are ${pct(confShare)} of the USD of this size. Any fee on this path is hidden, so none of it is called an app fee or a solver spread, and its app fee is not read as 0.` }]
        : []),
      near
        ? { key: 'revenue', value: `${near.bps.toFixed(1)} bps`, name: 'NEAR Revenue', share: 0, minPx: 0, text: `Part of the fees above, not on top of them. DefiLlama books ${near.bps.toFixed(1)} bps of Intents volume as NEAR revenue over the 30 days to ${dayName(near.to)}, all Intents. The chain does not show which fee account is NEAR's, so it can't be traced swap by swap.` }
        : { key: 'revenue', value: '—', name: 'NEAR Revenue', share: 0, minPx: 0, text: 'The revenue figure is not in the published file.' },
      { key: 'buyback', value: near ? `${near.bps.toFixed(1)} bps` : '—', name: 'Buyback', share: 0, minPx: 0, text: "All of NEAR's captured Intents revenue has bought NEAR on the open market since 23 Feb 2026, so the buyback is the NEAR revenue above. The bought NEAR is not burned (DefiLlama methodology)." },
    ],
    bannerText: `Anything the fees do not explain shows as "unexplained", never hidden. Left out and counted: ${int(left.notBothPriced.swaps)} swaps without a price on both sides, ${int(left.feeUnreadable.swaps)} with an app fee paid in a token the swap did not give, ${int(left.priceCheck.swaps)} that failed the price check. Swaps through the Confidential Intents treasury are not in this split.${gap}`,
    card: {
      value: bps(g.allInBps),
      label: `All-In Cost, ${size} Swaps`,
      text: `USD-weighted over ${int(g.swaps)} swaps, ${span}, against DefiLlama hourly prices. token_diff swaps ${td.allInBps != null ? bps(td.allInBps) : 'not measured'}, confidential path ${conf?.allInBps != null ? bps(conf.allInBps) : 'not measured'}, reported apart.`,
      source: `Chain days to ${dayName(trace.to)} 2026. Open the Query`,
    },
    explain: `A $10,000 swap costs about ${usd(d(g.allInBps))}: ${bps(g.allInBps)} less value comes out than goes in, at DefiLlama hourly prices. It is the USD-weighted average of ${int(g.swaps)} real public swaps of ${size}, ${span}.`,
    query: `Query: ${trace.query ?? 'feeTrace in analysis/realised_cost.mjs'}, published as data/published/fee_trace.json. Rules in PREREG.md section 7 and amendment A2.`,
    asOf: trace.to,
  };
}
