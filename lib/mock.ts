// Placeholder figures for the clickable prototype. Not measurements.
// They are the sample figures drawn in the Figma screens ("Sample from the draft")
// and are replaced by pipeline output once the readings are computed.
export type Status = 'Bullish' | 'Neutral' | 'Bearish' | 'Not Measured';

export const sample = {
  asOf: '30 Oct 2026',
  today: 3.89e9,
  max: 25e9,
  multiple: '3.5×',
  price: '$4.34',
  verdict: 'Undecided',
  thresholds: [
    { at: 13.7e9, note: 'under the 1.6% plan that passed its vote' },
    { at: 21.4e9, note: 'if issuance stays at 2.5%' },
  ],
  gapCaption: 'short each month at 1.6% issuance',
};

export const readings: { name: string; detail: string; status: Status }[] = [
  { name: 'Pricing Power', detail: 'Still to estimate', status: 'Not Measured' },
  { name: "NEAR's Share of Fees", detail: '36% last 30 days, sample', status: 'Bullish' },
  { name: 'Solver Competition', detail: 'Top 3 share still to compute', status: 'Not Measured' },
  { name: 'Largest Integrator', detail: '77% reported, unconfirmed', status: 'Neutral' },
  { name: 'Path to Deflation', detail: 'Revenue trend still to compute', status: 'Not Measured' },
];

// S2: what a $10,000 swap costs. Sample from the draft, to be re-run on the quote archive.
export const fee = {
  total: '$20.30',
  lead: '$20.30 in total, 20.3 bps over the outside price, quoted with no key. Sample from the draft, to be re-run.',
  // share = weight in the bar; minPx keeps a tiny part visible (the bar is not to scale for small parts).
  parts: [
    { key: 'app', value: '$20.00', name: 'App Fee, 20 bps', share: 20, minPx: 0, text: 'The default fee paid to account 5880ad2b…47dd. Whether that account is NEAR revenue is still to check.' },
    { key: 'spread', value: '$0.30', name: 'Solver Spread, About 0.3 bps', share: 0.3, minPx: 14, text: 'What the solver keeps above the fee.' },
    { key: 'protocol', value: '< $0.01', name: 'Protocol Fee, 0.01 bps', share: 0.01, minPx: 2, text: 'Taken on each leg.' },
    { key: 'revenue', value: '—', name: 'NEAR Revenue', share: 0, minPx: 0, text: 'Not traced yet. Whether the app fee account is a NEAR revenue account is still to check.' },
    { key: 'buyback', value: '—', name: 'Buyback', share: 0, minPx: 0, text: 'Not traced yet. Where bought NEAR goes is still to check.' },
    { key: 'unexplained', value: '$0.0', name: 'Unexplained', share: 0, minPx: 0, text: 'Shown here if the parts do not add up to the all-in cost within 0.5 bps.' },
  ],
  bannerText: 'Any remainder above 0.5 bps shows as "unexplained". Quotes come from 4 pairs and 4 sizes, sampled about every 4 hours.',
  card: {
    value: '20.3 bps',
    label: 'All-In Cost, $10k ETH to USDC',
    text: 'Measured against the Binance mid at the quote time. Sample from the draft.',
    source: 'Quote archive, 30 Oct 2026. Open the Query',
  },
};

// S3: elasticity, underpowered state (30 raw fee changes, list not frozen).
export const elasticity = {
  empty:
    'So far 30 raw fee changes were found, with duplicates not yet removed. Smallest effect it could see: shown once the list is frozen. Until then the threshold is shown across the whole range.',
  checks: [
    { name: 'Smallest Effect It Could See', text: 'Shown with every result, so a quiet answer is not mistaken for "no effect".' },
    { name: 'Placebo Dates', text: 'Volume is compared on dates when nothing changed, to see what chance looks like.' },
    { name: 'Drop the Biggest', text: 'The result is re-run without the largest frontend.' },
  ],
  chartCaption:
    'Volume change around each fee change, with the smallest effect it could see as the band. Appears when the event list is frozen.',
};

// S5: the two commands, and example values for previewing the anchored and mismatch states.
export type AnchorState = 'anchored' | 'mismatch';
export const commands = [
  { cmd: 'npm run verify', example: 'Example output: every number prints OK, then ALL OK', width: 520 },
  { cmd: 'npm run attest:check <day>', example: 'Example output: match, mismatch, or not yet anchored', width: 560 },
];
export const anchorStates: Record<AnchorState, { tag: string; text: string; archive: string; chain: string }> = {
  anchored: {
    tag: 'Anchored: 10 Nov 2026',
    text: 'The archive for 10 Nov 2026 hashes to the value stored on NEAR testnet. Example only.',
    archive: '9f3a…c71e',
    chain: '9f3a…c71e',
  },
  mismatch: {
    tag: 'Mismatch: 10 Nov 2026',
    text: 'The archive file for 10 Nov 2026 hashes to a different value than the one stored on NEAR testnet. Do not trust that day until the cause is found. Example only.',
    archive: '9f3a…c71e',
    chain: '41b0…77d2',
  },
};

export const bn =(n: number, digits = 1) => `$${(n / 1e9).toFixed(digits)}B`;
