// S1 view of thesis.json. Pure and type-annotations only, so Node runs it in tests and the site imports it.
type Side = 'Bullish' | 'Neutral' | 'Bearish' | 'Not Measured';
type Range = { low: number; mid: number; high: number };
export type ThesisDoc = {
  asOf: string;
  readings: { id: string; name: string; side: Side; detail: string; plain: string; source: string; query: string }[];
  verdict: { verdict: string; score: number; missing: number; held?: string[] };
  privateFlow?: PrivateFlow;
  vstar: { todayUsd: number; priceUsd: number; at16: Range; at25: Range; multiple16: number };
  text?: { asOf: string; fixed: string[]; live: string[] };
};

// PREREG A2: the treasury share of each reading's window, and the confidential share of the last 7 days (null until a treasury day is read).
type PrivateFlow = {
  line: number; q3: { days: number; share: number | null } | null; q4: { days: number; share: number | null } | null;
  confidential?: { last7: { days: number; daysRead: number; confidentialShare: number | null } } | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// With the file missing, the page keeps the sample figures and says so (the same fallback as S2 and S3).
export function thesisView<S extends { asOf: string; today: number; multiple: string; price: string; verdict: string; thresholds: { at: number; note: string }[] }>(
  doc: ThesisDoc | null,
  sample: S,
  sampleReadings: { name: string; detail: string; status: Side }[],
) {
  if (!doc) return { live: false as const, text: null, sample, readings: sampleReadings, verdictText: 'Three of five readings are not measured yet.', privateLine: null };
  const v = doc.vstar;
  const { verdict, score, missing, held = [] } = doc.verdict;
  const scoreText = `${score > 0 ? '+' : score < 0 ? '−' : ''}${Math.abs(score)} of 7`;
  const heldNames = doc.readings.filter((r) => held.includes(r.id)).map((r) => r.name).join(' and ');
  const verdictText =
    held.length
      ? `Held at Undecided: flow went private, so ${heldNames} ${held.length === 1 ? 'reads' : 'read'} Not Measured. Score ${scoreText}, but lost data may not move the verdict.`
      : missing >= 3
      ? `${missing} of five readings are not measured, so the verdict stays open.`
      : `Score ${scoreText}. Pricing Power and Path to Deflation count double.${missing ? ` ${missing} of five not measured.` : ''}`;
  return {
    live: true as const,
    text: doc.text ?? null,
    sample: {
      ...sample,
      asOf: date(doc.asOf.slice(0, 10)),
      today: v.todayUsd,
      multiple: `${v.multiple16.toFixed(1)}×`,
      price: `$${v.priceUsd.toFixed(2)}`,
      verdict,
      thresholds: [
        { at: v.at16.mid, note: 'under the 1.6% plan that passed its vote' },
        { at: v.at25.mid, note: 'if issuance stays at 2.5%' },
      ],
    },
    readings: doc.readings.map((r) => ({ name: r.name, detail: r.detail, status: r.side })),
    verdictText,
    privateLine: privateLine(doc.privateFlow),
  };
}

// One line for the Headline: treasury share, then the confidential share once a treasury day has been read.
function privateLine(p?: PrivateFlow) {
  if (p?.q3?.share == null) return null;
  const c = p.confidential?.last7;
  const conf = c?.confidentialShare != null ? `Confidential share ${pct(c.confidentialShare)} (${c.daysRead} of ${c.days} days read).` : 'Confidential share Not Measured until the treasury days are read.';
  return `The Confidential Intents treasury carried ${pct(p.q3.share)} of counted USD over the last ${p.q3.days} frozen days. ${conf}`;
}

// S6: the four size rows and the whole-window figure. Solver columns come from the E3 sampled days; "Not Measured" when there are none.
type SolverCell = { top3: number | null; hhi: number | null; sampled: number };
export type ConcentrationDoc = { window: string; source: string; bySize: Record<string, { name: string; share: number } | null>;
  tokenDiffShareOfUsd?: number | null; feeUnreadable?: { usd: number }; largest?: { name: string; share: number; shareOfNamed: number } | null;
  solvers?: { days: string[]; bySize: Record<string, SolverCell>; allSizes?: { top3: number | null }; tokenDiffOnly?: { top3: number | null }; stability?: { perDayTop3: { top3: number | null }[]; leaveOneDayOut: { min: number; max: number } } | false } | null };
const SIZE_ROWS: [string, string][] = [['0-1k', '$0 to $1k'], ['1k-10k', '$1k to $10k'], ['10k-100k', '$10k to $100k'], ['100k+', '$100k and Up']];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v / 1e3)}k`);
// Where a top-3 range sits against Solver Competition's 60% and 80% lines.
const side = (lo: number, hi: number) =>
  hi < 0.6 ? 'all under the 60% line Solver Competition uses' : lo > 0.8 ? 'all over its 80% line' : lo >= 0.6 && hi <= 0.8 ? 'all between the 60% and 80% lines Solver Competition uses' : 'across a line Solver Competition uses';

export function concentrationView(doc: { concentration?: ConcentrationDoc; privateFlow?: PrivateFlow } | null, headlineShare: string | null) {
  const c = doc?.concentration;
  const pf = doc?.privateFlow;
  // The line comes from the file, so a later amendment can't leave this page on an old one.
  const over = (s?: { share: number | null } | null) => s?.share != null && pf?.line != null && s.share > pf.line;
  const tops = c?.solvers && c.solvers.stability ? c.solvers.stability.perDayTop3.flatMap((d) => (d.top3 == null ? [] : [d.top3])) : [];
  if (!c) return { live: false as const, rows: SIZE_ROWS.map(([, label]) => [label, 'Not Measured', 'Not Measured', 'Not Measured']), solverDays: null as string[] | null, solverNote: null as string | null, integratorNote: null as string | null, window: null, ours: null };
  return {
    live: true as const,
    rows: SIZE_ROWS.map(([key, label]) => {
      const t = c.bySize[key];
      const sv = c.solvers?.bySize[key];
      return [label, t ? `${t.name} ${pct(t.share)}` : 'Not Measured', sv?.top3 != null ? pct(sv.top3) : 'Not Measured', sv?.hhi != null ? Math.round(sv.hhi).toLocaleString('en-US') : 'Not Measured'];
    }),
    solverDays: c.solvers ? c.solvers.days : null,
    solverNote: c.solvers?.stability && c.solvers.allSizes?.top3 != null
      ? `All sizes together, the top 3 solvers fill ${pct(c.solvers.allSizes.top3)} of public USD over these days. Single days range from ${pct(Math.min(...tops))} to ${pct(Math.max(...tops))}, and leaving out any one day gives ${pct(c.solvers.stability.leaveOneDayOut.min)} to ${pct(c.solvers.stability.leaveOneDayOut.max)}, ${side(c.solvers.stability.leaveOneDayOut.min, c.solvers.stability.leaveOneDayOut.max)}. The Confidential Intents treasury 51e8f94d… is left out: it is a bridge to a private chain, not a solver.${c.solvers.tokenDiffOnly?.top3 != null ? ` Counting token_diff swaps only, the top 3 fill ${pct(c.solvers.tokenDiffOnly.top3)}.` : ''}${over(pf?.q3) ? ` The treasury carried ${pct(pf!.q3!.share!)} of USD over these days, so these are side figures that set no reading.` : ''}`
      : null,
    integratorNote: c.largest && c.tokenDiffShareOfUsd != null
      ? `Only token_diff swaps carry a frontend and a visible app fee; they are ${pct(c.tokenDiffShareOfUsd)} of the USD over these days, less since flow moved to the Confidential Intents treasury from 28 Oct. ${c.largest.name} pays ${pct(c.largest.share)} of the app fees seen; with unnamed and blank referrals left out it is ${pct(c.largest.shareOfNamed)}. Swaps whose fee is paid in a token the swap did not give (${money(c.feeUnreadable?.usd ?? 0)}) are left out.${over(pf?.q4) ? ` The treasury carried ${pct(pf!.q4!.share!)} of USD over these days, so this is a side figure that sets no reading.` : ''}`
      : null,
    window: c.window,
    ours: headlineShare,
  };
}
