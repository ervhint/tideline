import { bn } from '@/lib/mock';

type Threshold = { at: number; note: string };
// today === null: the volume feed did not load (Figma: S4 error). No fill and no gap, only the thresholds.
type Props = { today: number | null; max: number; thresholds: Threshold[]; todayNote: string; gapCaption: string; gapTo?: number };

const EDGE = 0.92;
const pct = (n: number, max: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
const scale = [0, 5, 10, 15, 20, 25];
const NO_GAP = "Gap not shown: needs today's volume";

export function Gauge({ today, max, thresholds, todayNote, gapCaption, gapTo }: Props) {
  const p = (n: number) => pct(n, max);
  const target = gapTo ?? thresholds[0].at;
  const known = today !== null;
  const edgeOnes = thresholds.filter((t) => t.at >= EDGE * max).sort((x, y) => x.at - y.at);
  const t0 = today ?? 0;
  const gap = bn(Math.max(0, target - t0));
  const mid = p((t0 + target) / 2);
  const todayLabel = known ? `Today ${bn(t0, 2)}` : 'Today: Not Loaded';
  const note = known ? todayNote : 'needs the volume feed';
  const cap = known ? gapCaption : NO_GAP;
  return (
    <>
      <figure className="gauge num" aria-label={`Fee volume today against the ${thresholds.length} thresholds`} style={{ marginLeft: 0, marginRight: 0 }}>
        <div className="abs track" />
        {scale.map((s) => (
          <span key={s}>
            <div className="abs stick" style={{ left: s === 25 ? 'calc(100% - 1px)' : p(s * 1e9) }} />
            <div
              className="abs slabel"
              style={s === 0 ? { left: 0 } : s === 25 ? { right: 0 } : { left: p(s * 1e9), transform: 'translateX(-50%)' }}
            >{`$${s}B`}</div>
          </span>
        ))}
        {known ? <div className="abs fill" style={{ width: p(t0) }} /> : <div className="abs unknown" style={{ width: p(target) }} />}
        <div className="abs tval" style={{ left: 0, marginLeft: 0 }}>{todayLabel}</div>
        <div className="abs tnote" style={{ left: 0, marginLeft: 0 }}>{note}</div>
        {thresholds.filter((t) => t.at < EDGE * max).map((t) => (
          <span key={t.at}>
            <div className="abs ttick" style={{ left: p(t.at) }} />
            <div className="abs tval" style={{ left: p(t.at) }}>{bn(t.at)}</div>
            <div className="abs tnote" style={{ left: p(t.at) }}>{t.note}</div>
          </span>
        ))}
        {/* Near or past the right end the labels sit left of the end, one above the bar and the next below it, so they stay inside the card; past the scale they say so. */}
        {edgeOnes.length > 0 && (
          <>
            {edgeOnes.map((t) => (
              <div key={t.at} className="abs ttick" style={{ left: `calc(${p(t.at)} - 3px)` }} />
            ))}
            {edgeOnes.map((t, i) => (
              <div key={t.at} className="abs edgelabel" style={{ right: `calc(100% - ${p(t.at)} + 11.5px)`, top: i % 2 ? 206 : 68 }}>
                <div className="tval">{bn(t.at)}</div>
                <div className="tnote">{t.at > max ? `${t.note}, off the scale` : t.note}</div>
              </div>
            ))}
          </>
        )}
        {known && (
          <>
            <div className="abs bline" style={{ left: p(t0), width: `calc(${p(target)} - ${p(t0)})` }} />
            <div className="abs bcap" style={{ left: p(t0) }} />
            <div className="abs bcap" style={{ left: `calc(${p(target)} - 1px)` }} />
            <div className="abs gapnum" style={{ left: mid }}>{gap}</div>
          </>
        )}
        <div className="abs gapcap" style={{ left: mid }}>{cap}</div>
      </figure>

      <div className="gauge-m num">
        {known && <p className="gapnum">{gap}</p>}
        <p className="gapcap">{cap}</p>
        <div className="bar" role="img" aria-label={known ? `Today ${bn(t0, 2)} of ${bn(max, 0)}` : 'Today is not loaded'}>
          <div className="track" />
          {known && <div className="fill" style={{ width: p(t0) }} />}
          {thresholds.map((t) => (
            <div key={t.at} className="tick" style={{ left: p(t.at) }} />
          ))}
        </div>
        <div className="ends"><span>$0</span><span>{bn(max, 0)}</span></div>
        <dl>
          <dt>{todayLabel}</dt><dd>{note}</dd>
          {thresholds.map((t) => (
            <span key={t.at} style={{ display: 'contents' }}><dt>{bn(t.at)}</dt><dd>{t.note}</dd></span>
          ))}
        </dl>
      </div>
    </>
  );
}
