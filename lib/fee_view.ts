// S2 view of the fee trace. Pure and type-annotations only, so Node can run it directly (tests) and the site can import it.
export type TraceGroup = {
  pair: string; sizeUsd: number; n: number; failed: number;
  allInBps?: number; allInMinBps?: number; allInMaxBps?: number;
  appFeeBps?: number; withdrawBps?: number; protocolBps?: number; unexplainedBps?: number;
};
type NearBucket = { appFeeBps: number; nearBps: number; nearShareOfAppFees: number };
export type FeeTrace = {
  asOf: string; from: string; quotes: number; groups: TraceGroup[];
  protocolFee?: { bps: number; collector: string };
  nearShare?: { from: string; to: string; days: number; buckets: Record<string, NearBucket> };
};
const bucketOf = (usd: number) => (usd < 1000 ? '0-1k' : usd < 10000 ? '1k-10k' : usd < 100000 ? '10k-100k' : '100k+');
const BUCKET_NAME: Record<string, string> = { '0-1k': '$0 to $1k', '1k-10k': '$1k to $10k', '10k-100k': '$10k to $100k', '100k+': 'over $100k' };

const usd = (v: number) => (v < 0.005 ? '< $0.01' : `$${v.toFixed(2)}`);
const bps = (v: number) => `${v.toFixed(1)} bps`;
const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 10)}, ${new Date(iso).toISOString().slice(11, 16)} UTC`;

// S2: what a $10,000 ETH to USDC swap costs, from the quote archive. Falls back to the sample if the file is missing.
export function feeView<S extends object>(trace: FeeTrace | null, sampleFee: S) {
  const g = trace?.groups.find((x) => x.pair === 'ETH-USDC' && x.sizeUsd === 10000);
  if (!trace || !g || !g.n) return { ...sampleFee, live: false as const, spreadNote: 'About $0.30 Outside the App Fee', spreadSub: 'Solver spread $0.30 and protocol fee under $0.01', explain: 'A $10,000 swap from ETH to USDC costs $20.30. That is 20.3 bps more than the outside price, measured against the Binance mid at the quote time.', asOf: null as string | null };
  const size = g.sizeUsd;
  const d = (b: number) => (b / 1e4) * size;
  const total = d(g.allInBps!);
  const unexplained = Math.max(g.unexplainedBps!, 0);
  const protocol = g.protocolBps ?? 0;
  const asOf = utc(trace.asOf);
  const b = trace.nearShare?.buckets[bucketOf(size)];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return {
    live: true as const,
    total: usd(total),
    lead: `${usd(total)} in total, ${bps(g.allInBps!)} below the outside price, quoted with no key. Median of ${g.n} quotes, ${trace.from.slice(0, 10)} to ${trace.asOf.slice(0, 10)}.`,
    spreadNote: `${usd(d(g.withdrawBps!) + d(protocol) + d(unexplained))} Outside the App Fee`,
    spreadSub: `Withdraw fee ${usd(d(g.withdrawBps!))}, protocol fee ${usd(d(protocol))} and solver spread ${usd(d(unexplained))}`,
    // share = weight in the bar; minPx keeps a tiny part visible (the bar is not to scale for small parts).
    parts: [
      { key: 'app', value: usd(d(g.appFeeBps!)), name: `App Fee, ${g.appFeeBps} bps`, share: g.appFeeBps!, minPx: 0, text: 'The default fee, named in every quote and paid to account 5880ad2b…47dd. That account collects fees, but chain data does not show that NEAR owns it (see Open the Query).' },
      { key: 'withdraw', value: usd(d(g.withdrawBps!)), name: `Withdraw Fee, ${g.withdrawBps!.toFixed(1)} bps`, share: g.withdrawBps!, minPx: 14, text: 'A fixed 0.30 USDC charged for sending the funds out. It is a flat amount, so it weighs most on small swaps.' },
      { key: 'protocol', value: usd(d(protocol)), name: `Protocol Fee, ${protocol.toFixed(2)} bps`, share: protocol, minPx: 2, text: `Charged by the intents.near contract on the token you send, read from the chain: fee() is 1 pip, which is 0.01 bps, and it has not moved since January 2026. It goes to the contract's fee collector${trace.protocolFee ? `, account ${trace.protocolFee.collector.slice(0, 8)}…${trace.protocolFee.collector.slice(-4)}` : ''}.` },
      { key: 'unexplained', value: usd(d(unexplained)), name: `Solver Spread, Unexplained Rest, ${bps(unexplained)}`, share: unexplained, minPx: 2, text: 'What is left after the three fees above. It is mostly what the solver keeps, plus any price movement between the Binance mid and the quote. Shown, never hidden.' },
      b
        ? { key: 'revenue', value: `${b.nearBps.toFixed(1)} bps`, name: 'NEAR Revenue', share: 0, minPx: 0, text: `Part of the app fee, not on top of it. On executed 1Click swaps of ${BUCKET_NAME[bucketOf(size)]}, ${b.nearBps.toFixed(1)} bps of volume (${pct(b.nearShareOfAppFees)} of their ${b.appFeeBps.toFixed(0)} bps of app fees) is listed by the Explorer as paid to NEAR's revenue wallets, last ${trace.nearShare!.days} days to ${trace.nearShare!.to}. The Explorer's recipient names are labels: on chain, a fee it lists as NEAR's buyback wallet went to 5880ad2b…47dd, the account this quote names, whose owner the chain does not show.` }
        : { key: 'revenue', value: '—', name: 'NEAR Revenue', share: 0, minPx: 0, text: 'The per-size fee split is not in the published file.' },
      { key: 'buyback', value: b ? `${b.nearBps.toFixed(1)} bps` : '—', name: 'Buyback', share: 0, minPx: 0, text: "All of NEAR's captured Intents revenue has bought NEAR on the open market since 23 Feb 2026, so the buyback is the NEAR revenue above. The bought NEAR is not burned (DefiLlama methodology)." },
    ],
    bannerText: `Anything the three fees do not explain shows as "unexplained", never hidden. ${trace.quotes} quotes from 4 pairs and 4 sizes, sampled about every 4 hours, so the figure moves with the market.`,
    card: {
      value: bps(g.allInBps!),
      label: 'All-In Cost, $10k ETH to USDC',
      text: `Median of ${g.n} quotes, measured against the Binance mid at the quote time. Range ${g.allInMinBps!.toFixed(1)} to ${g.allInMaxBps!.toFixed(1)} bps.`,
      source: `Quote archive, latest ${asOf}. Open the Query`,
    },
    explain: `A $10,000 swap from ETH to USDC costs ${usd(total)}. That is ${bps(g.allInBps!)} less USDC than the Binance mid says the ETH is worth, median of ${g.n} quotes.`,
    asOf: trace.asOf,
  };
}

