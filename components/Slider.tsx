'use client';

type Common = { disabled?: boolean; label: string; display: string; min: number; max: number; step: number; ticks: string[] };
type One = Common & { value: number; onChange: (v: number) => void };
type Two = Common & { range: [number, number]; onRange: (v: [number, number]) => void };

const pct = (v: number, min: number, max: number) => ((v - min) / (max - min)) * 100;

// Figma: Slider. A single handle, or two for a range (the elasticity assumption).
export function Slider(props: One | Two) {
  const { label, display, min, max, step, ticks } = props;
  const two = 'range' in props;
  const lo = two ? props.range[0] : min;
  const hi = two ? props.range[1] : props.value;
  const from = pct(lo, min, max);
  const to = pct(hi, min, max);
  return (
    <div className={`slider${props.disabled ? ' off' : ''}`}>
      <div className="sl-head"><span>{label}</span><span className="num">{display}</span></div>
      <div className="sl-track">
        <span className="sl-fill" style={{ left: `${from}%`, width: `${to - from}%` }} />
        {two ? (
          <>
            <input type="range" disabled={props.disabled} aria-label={`${label}, lower`} min={min} max={max} step={step} value={lo}
              onChange={(e) => props.onRange([Math.min(+e.target.value, hi), hi])} />
            <input type="range" disabled={props.disabled} aria-label={`${label}, upper`} min={min} max={max} step={step} value={hi}
              onChange={(e) => props.onRange([lo, Math.max(+e.target.value, lo)])} />
          </>
        ) : (
          <input type="range" disabled={props.disabled} aria-label={label} min={min} max={max} step={step} value={props.value}
            onChange={(e) => props.onChange(+e.target.value)} />
        )}
      </div>
      <div className="sl-ticks num">{ticks.map((t) => <span key={t}>{t}</span>)}</div>
    </div>
  );
}

export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="seg-wrap">
      <p className="seg-label" id={`seg-${label}`}>{label}</p>
      <div className="seg" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}
