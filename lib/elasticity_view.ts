// S3 view of the elasticity result. Pure and type-annotations only, so Node runs it in tests and the site imports it.
type Stat = { estimate: number; lo: number; hi: number; p: number; pMin: number; mde: number; underpowered: boolean };
type Run = { usable: number; dropped: { frontend: string; firstDayAfter: string; reason: string }[]; events: { firstDayAfter: string }[]; e1: Stat | null; e2: Stat | null; e2Events?: number };
type Switch = { label: string; len: number; intentsLogChange: number; cowLogChange: number; change: number; others?: { name: string; change: number }[] };
type RefRun = { label: string; usable: number; estimate: number | null; lo?: number; hi?: number; explorerSameSwaps: number | null; underpowered?: boolean };
export type ElasticityDoc = { asOf: string; reps: number; frozenEvents: number; main: Run; checks: Record<string, Run & { label: string }>; feeSwitch?: Switch | null; e2Reference?: RefRun | null; notRun: string[] };

const n = (v: number) => v.toFixed(2).replace('-', '−');
const range = (s: Stat) => `${n(s.lo)} to ${n(s.hi)}`;
const pct = (log: number) => `${log >= 0 ? '+' : '−'}${Math.abs(Math.round((Math.exp(log) - 1) * 100))}%`;
const refText = (r: RefRun) => r.estimate === null
  ? `Only ${r.usable} fee changes had enough swaps priced on Binance, so there is no estimate.`
  : `Users pay ${n(r.estimate)} of each fee change, interval ${n(r.lo!)} to ${n(r.hi!)} (events resampled), from ${r.usable} fee changes${r.underpowered ? ', underpowered' : ''}. The Explorer's own prices give ${n(r.explorerSameSwaps!)} on the same swaps.`;
const switchText = (f: Switch) => `In the ${f.len} days after, 1Click volume moved ${pct(f.intentsLogChange)} and CoW Swap ${pct(f.cowLogChange)}, so ${pct(f.change)} against the control.${f.others?.length ? ` Against the other venues: ${f.others.map((o) => `${o.name} ${pct(o.change)}`).join(', ')}.` : ''} One date and no placebo, so this is descriptive, not a result.`;

// First line says "underpowered" when the interval spans zero or the effect is smaller than the smallest one it could see (AC-5.3).
// Under 3 usable events it says the count and that the fee trace and threshold lead (AC-5.4).
export function elasticityView<S extends { empty: string; checks: { name: string; text: string }[] }>(doc: ElasticityDoc | null, sample: S) {
  if (!doc) return { ...sample, live: false as const, head: 'Not Enough Fee Changes to Say Yet', days: null as string[] | null, caption: null as string | null, mde: null as string | null, plot: null };
  const m = doc.main;
  const days = [...m.events.map((e) => e.firstDayAfter), ...m.dropped.map((e) => e.firstDayAfter)];
  const caption = `Each tick is one of the ${doc.frozenEvents} frozen fee changes (${m.usable} usable). Duplicates are removed; the list was frozen on 1 Nov 2026.`;
  if (m.usable < 3 || !m.e1) {
    return { live: true as const, head: 'Not Enough Fee Changes to Say Yet', empty: `Only ${m.usable} of the ${doc.frozenEvents} frozen fee changes are usable, which is under 3. The fee trace and the threshold stay the lead until there are more.`, checks: sample.checks, days, caption, mde: null, plot: null };
  }
  const e = m.e1;
  const lead = e.underpowered ? 'Underpowered' : e.hi < 0 ? 'Volume Leaves When Fees Rise' : 'Volume Does Not Leave When Fees Rise';
  const pass = m.e2 ? `Users pay **${n(m.e2.estimate)}** of each fee change (1 means all of it). Interval ${range(m.e2)}${m.e2.underpowered ? ', also underpowered' : ''}.` : null;
  const checks = [
    { name: 'Placebo Dates', text: `${doc.reps.toLocaleString('en-US')} random dates with no fee change gave p = ${e.p.toFixed(2)} (lowest possible ${e.pMin.toFixed(4)}).` },
    ...Object.values(doc.checks).filter((c) => c.e1).map((c) => ({ name: c.label, text: `${n(c.e1!.estimate)}, interval ${range(c.e1!)}, ${c.usable} fee changes.` })),
    ...(doc.e2Reference ? [{ name: doc.e2Reference.label, text: refText(doc.e2Reference) }] : []),
    ...(doc.feeSwitch ? [{ name: doc.feeSwitch.label, text: switchText(doc.feeSwitch) }] : []),
    ...doc.notRun.map((t) => ({ name: 'Not Run', text: t })),
  ];
  return {
    live: true as const,
    head: lead,
    empty: [`Elasticity **${n(e.estimate)}**, 95% interval ${range(e)}, from ${m.usable} of ${doc.frozenEvents} frozen fee changes. 1Click only.`, 'At −1, a higher fee leaves revenue flat. Below −1 it lowers revenue; above −1 it raises it.', pass].filter(Boolean).join(String.fromCharCode(10)),
    checks,
    days,
    caption,
    plot: { est: e.estimate, lo: e.lo, hi: e.hi, mde: e.mde },
    mde: `Smallest effect it could see: ${n(e.mde)}`,
  };
}
