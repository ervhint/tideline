// S3: where the elasticity result sits against 0 ("fees don't matter") and -1 ("revenue stays flat").
// Dot = estimate, bar = 95% interval, pale band = smaller than the smallest effect it could see.
export type Plot = { est: number; lo: number; hi: number; mde: number };

const f = (v: number) => v.toFixed(2).replace('-', '−');

export function IntervalPlot({ est, lo, hi, mde }: Plot) {
  const min = Math.min(-3, Math.floor(lo) - 0.5), max = Math.max(2, Math.ceil(hi) + 0.5);
  const pct = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`;
  const wide = (a: number, b: number) => `${((Math.min(max, b) - Math.max(min, a)) / (max - min)) * 100}%`;
  const ticks = [-3, -2, -1, 0, 1, 2].filter((t) => t >= min && t <= max);
  return (
    <figure className="ci" role="img" aria-label={`Elasticity ${f(est)}, 95% interval ${f(lo)} to ${f(hi)}, smallest effect it could see ${f(mde)}`}>
      <p className="ci-title">Where the Answer Sits</p>
      <p className="ci-cap">Dot: the estimate. Bar: the 95% interval. Pale band: effects too small to tell from chance.</p>
      <div className="ci-plot">
        <span className="ci-track" />
        <span className="ci-band" style={{ left: pct(-mde), width: wide(-mde, mde) }} />
        {ticks.map((t) => (
          <span key={t}>
            <span className={t === 0 || t === -1 ? 'ci-tick key' : 'ci-tick'} style={{ left: pct(t) }} />
            <span className={t === 0 || t === -1 ? 'ci-lab key' : 'ci-lab'} style={{ left: pct(t) }}>{t === 0 ? '0' : f(t).replace('.00', '')}</span>
          </span>
        ))}
        <span className="ci-bar" style={{ left: pct(lo), width: wide(lo, hi) }} />
        <span className="ci-dot" style={{ left: pct(est) }} />
        <span className="ci-end" style={{ left: pct(lo) }}>{f(lo)}</span>
        <span className="ci-end" style={{ left: pct(hi) }}>{f(hi)}</span>
      </div>
      <p className="ci-key"><b>0</b> fees do not change volume. <b>−1</b> volume falls as fast as the fee rises, so revenue stays flat. Left of −1, a higher fee loses revenue.</p>
    </figure>
  );
}
