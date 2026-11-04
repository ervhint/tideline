// S1 view of thesis.json. Pure and type-annotations only, so Node runs it in tests and the site imports it.
type Side = 'Bullish' | 'Neutral' | 'Bearish' | 'Not Measured';
type Range = { low: number; mid: number; high: number };
export type ThesisDoc = {
  asOf: string;
  readings: { id: string; name: string; side: Side; detail: string; plain: string; source: string; query: string }[];
  verdict: { verdict: string; score: number; missing: number };
  vstar: { todayUsd: number; priceUsd: number; at16: Range; at25: Range; multiple16: number };
  text?: { asOf: string; fixed: string[]; live: string[] };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// With the file missing, the page keeps the sample figures and says so (the same fallback as S2 and S3).
export function thesisView<S extends { asOf: string; today: number; multiple: string; price: string; verdict: string; thresholds: { at: number; note: string }[] }>(
  doc: ThesisDoc | null,
  sample: S,
  sampleReadings: { name: string; detail: string; status: Side }[],
) {
  if (!doc) return { live: false as const, text: null, sample, readings: sampleReadings, verdictText: 'Three of five readings are not measured yet.' };
  const v = doc.vstar;
  const { verdict, score, missing } = doc.verdict;
  const verdictText =
    missing >= 3
      ? `${missing} of five readings are not measured, so the verdict stays open.`
      : `Score ${score > 0 ? '+' : score < 0 ? '−' : ''}${Math.abs(score)} of 7. Pricing Power and Path to Deflation count double.${missing ? ` ${missing} of five not measured.` : ''}`;
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
  };
}

// S6: the four size rows and the whole-window figure. Solver columns come from the E3 sampled days; "Not Measured" when there are none.
type SolverCell = { top3: number | null; hhi: number | null; sampled: number };
export type ConcentrationDoc = { window: string; source: string; bySize: Record<string, { name: string; share: number } | null>; solvers?: { days: string[]; bySize: Record<string, SolverCell>; allSizes?: { top3: number | null }; stability?: { perDayTop3: { top3: number }[]; leaveOneDayOut: { min: number; max: number } } | false } | null };
const SIZE_ROWS: [string, string][] = [['0-1k', '$0 to $1k'], ['1k-10k', '$1k to $10k'], ['10k-100k', '$10k to $100k'], ['100k+', '$100k and Up']];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function concentrationView(doc: { concentration?: ConcentrationDoc } | null, headlineShare: string | null) {
  const c = doc?.concentration;
  if (!c) return { live: false as const, rows: SIZE_ROWS.map(([, label]) => [label, 'Not Measured', 'Not Measured', 'Not Measured']), solverDays: null as string[] | null, solverNote: null as string | null, window: null, ours: null };
  return {
    live: true as const,
    rows: SIZE_ROWS.map(([key, label]) => {
      const t = c.bySize[key];
      const sv = c.solvers?.bySize[key];
      return [label, t ? `${t.name} ${pct(t.share)}` : 'Not Measured', sv?.top3 != null ? pct(sv.top3) : 'Not Measured', sv?.hhi != null ? Math.round(sv.hhi).toLocaleString('en-US') : 'Not Measured'];
    }),
    solverDays: c.solvers ? c.solvers.days : null,
    solverNote: c.solvers?.stability && c.solvers.allSizes?.top3 != null
      ? `All sizes together, the top 3 solvers fill ${pct(c.solvers.allSizes.top3)} over these days. Single days range from ${pct(Math.min(...c.solvers.stability.perDayTop3.map((d) => d.top3)))} to ${pct(Math.max(...c.solvers.stability.perDayTop3.map((d) => d.top3)))}, and leaving out any one day gives ${pct(c.solvers.stability.leaveOneDayOut.min)} to ${pct(c.solvers.stability.leaveOneDayOut.max)}, so this sits on the 60% line Solver Competition uses. The largest, 51e8f94d…, fills by direct transfers and sometimes passes part of a trade on to other solvers; it counts here as one solver.`
      : null,
    window: c.window,
    ours: headlineShare,
  };
}
