import type { CSSProperties } from 'react';
import { bn } from '@/lib/mock';
import { Stale } from './Stale';

// S1's first screen, measured from DESIGN-REFERENCE-3.md: every position is the reference's --x, --y and --sx.
const at = (x: number, y: number, sx?: number) => ({ '--x': x, '--y': y, ...(sx ? { '--sx': sx } : {}) }) as CSSProperties;
const METER_MAX = 30e9;
const Chevron = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="m6.6 3.6 6 5.4-6 5.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

type Props = { asOf: string; live: boolean; multiple: string; today: number; gapTo: number; gapCaption: string; verdict: string };

export function Hero({ asOf, live, multiple, today, gapTo, gapCaption, verdict }: Props) {
  return (
    <section className="card" aria-label="Headline">
      <div className="hx-stack">
        <Stale />
        <div className="hero-blk">
          <p className="eyebrow l c sx" style={at(65.7, -209.2, 0.9293)}>{live ? `Data as of ${asOf}` : `Data as of ${asOf}. Sample, not a result`}</p>
          <h1 className="hx-h1 l c num" style={at(62.6, -167.3)}>
            <span className="sx" style={{ '--sx': 0.9431 } as CSSProperties}>Volume Must Reach</span><br />
            <span className="sx" style={{ '--sx': 0.9792 } as CSSProperties}>{multiple} Today</span>
          </h1>
          <div className="tagrow">
            <a className="play l c" style={at(66, 34)} href="#gauge" aria-label="Go to the gauge">
              <svg viewBox="0 0 13 14" fill="none" aria-hidden="true"><path d="M1.4 1.3 11.6 7 1.4 12.7z" fill="#0b1526" /></svg>
            </a>
            <span className="hx-tag l c sx" style={at(131, 48.7, 0.8973)}>before buybacks cover 1.6% issuance.</span>
          </div>
          <aside className="hx-panel l c r" style={at(58, -165)}>
            <span className="p-title sx" style={{ '--sx': 0.8707 } as CSSProperties}>{verdict}</span>
            <span className="dot" />
            <span className="ring"><img src="/assets/mark.svg" alt="" width={30} height={30} /></span>
            <p className="p-sub sx" style={{ '--sx': 0.8899 } as CSSProperties}>Volume<br />Today<br />Per Month</p>
            <div className="hx-scale num"><span>$0</span><span>$10B</span><span>$20B</span><span>$30B</span></div>
            <div className="hx-track" role="img" aria-label={`Today ${bn(today, 2)} on a scale to ${bn(METER_MAX, 0)}`}>
              <i style={{ width: `${Math.min(100, (today / METER_MAX) * 100)}%` }} />
            </div>
          </aside>
        </div>
        <div className="hx-row">
          <div className="stats">
            <div className="stat">
              <span className="hx-num l b sx" style={at(64, 60.4, 1)}>{bn(today)}</span>
              <span className="hx-lbl l b sx" style={at(358, 73.2, 0.9634)}>Volume<br />Last<br />30 Days</span>
            </div>
            <span className="slash l b" style={at(470, 76)} />
            <div className="stat">
              <span className="hx-num l b sx" style={at(520, 60.4, 0.9858)}>{bn(Math.max(0, gapTo - today))}</span>
              <span className="hx-lbl l b sx hx-lbl2" style={at(810, 73.2, 0.9209)}>{gapCaption}</span>
            </div>
          </div>
          <a className="meet l b r" style={at(59, 66)} href="/model/">
            <span className="thumb"><img alt="" style={{ objectPosition: '60% 50%' }} src="/media/sphere-poster.png" /></span>
            <b>Open Model</b>
            <span className="hx-knob"><Chevron /></span>
          </a>
        </div>
      </div>
    </section>
  );
}
