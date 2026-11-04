'use client';
import { useEffect, useState } from 'react';
import { Banner } from '@/components/Banner';
import { Gauge } from '@/components/Gauge';
import { Segmented, Slider } from '@/components/Slider';
import { type Market, MAX_SEEN_FEE_BPS, atFee, firstReached, revenueMaxFeeBps, vStar, vStarPath, vStarRange } from '@/lib/model';
import { bn } from '@/lib/mock';

const SCHEDULES = ['1.6% (vote passes)', '2.5% (vote fails)', 'Custom'] as const;
const PATHS = ['Flat', '+50%', '2×'] as const;
const FACTOR: Record<(typeof PATHS)[number], number> = { Flat: 1, '+50%': 1.5, '2×': 2 };
const ISSUANCE: Record<string, number> = { '1.6% (vote passes)': 1.6, '2.5% (vote fails)': 2.5 };
const minus = (n: number) => (n < 0 ? `−${Math.abs(n).toFixed(2)}` : `+${n.toFixed(2)}`);
const E_MIN = -2, E_MAX = 0.5; // the U5 interval reaches +0.39, so the slider goes past 0

export function ModelView({ market, asOf, live, elasticity }: { market: Market; asOf: string; live: boolean; elasticity: { estimate: number; lo: number; hi: number } | null }) {
  const TODAY = market.todayVolume;
  const [issuance, setIssuance] = useState(1.6);
  const [price, setPrice] = useState(Math.round(market.priceUsd * 100) / 100);
  const clamp = (x: number) => Math.min(E_MAX, Math.max(E_MIN, Math.round(x * 100) / 100));
  const [elast, setElast] = useState<[number, number]>(elasticity ? [clamp(elasticity.lo), clamp(elasticity.hi)] : [-1.4, -0.6]);
  const [buyback, setBuyback] = useState(100);
  const [path, setPath] = useState<(typeof PATHS)[number]>('Flat');
  // `?state=error` previews the designed error: today's volume did not load, the threshold still works.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(new URLSearchParams(window.location.search).get('state') === 'error');
  }, []);

  // Custom is lit whenever the slider is off both HSP-029 presets. Clicking it moves focus to that slider.
  const schedule = SCHEDULES.find((s) => ISSUANCE[s] === issuance) ?? 'Custom';
  const pickSchedule = (s: (typeof SCHEDULES)[number]) => {
    if (s === 'Custom') document.querySelector<HTMLInputElement>('input[aria-label="Issuance (Custom)"]')?.focus();
    else setIssuance(ISSUANCE[s]);
  };
  const base = { price, buybackShare: buyback / 100 };
  const v = vStar({ ...base, issuancePct: issuance }, market);
  const range = vStarRange({ ...base, issuancePct: issuance }, market);
  const v16 = vStar({ ...base, issuancePct: 1.6 }, market);
  const v25 = vStar({ ...base, issuancePct: 2.5 }, market);
  // The date follows the chosen schedule: the HSP-029 ramp if the vote passes, a flat rate otherwise.
  const start = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, 1));
  const pts = vStarPath(market, price, buyback / 100, schedule.startsWith('1.6'), FACTOR[path], start, 120, schedule === 'Custom' ? issuance : undefined);
  const hit = firstReached(pts);

  // FR-11: the fee that maximizes revenue across the chosen elasticity range, and what V* that fee needs.
  const fee0 = market.feeBps ?? 15.4;
  const [fLow, fHigh] = [revenueMaxFeeBps(elast[0]), revenueMaxFeeBps(elast[1])];
  const at = (f: number, e: number) => atFee({ ...base, issuancePct: issuance }, market, f, e);
  const where = (f: number, e: number) => { const a = at(f, e); return `At ${f.toFixed(1)} bps, expect about ${bn(a.volume)} a month and need ${bn(a.need)} (${a.multiple.toFixed(1)}×).`; };
  const beyond = (f: number) => (f > MAX_SEEN_FEE_BPS ? ` That is past the largest fee in the events (${MAX_SEEN_FEE_BPS} bps), so the estimate does not cover it.` : '');
  const maxFee =
    fLow === null
      ? `With elasticity ${minus(elast[0])} to ${minus(elast[1])}, revenue keeps rising with the fee across the fees seen (up to ${MAX_SEEN_FEE_BPS} bps), so there is no maximum to show. Today's all-in fee is ${fee0.toFixed(1)} bps.`
      : fHigh === null
        ? `Only the low end has a maximum: about ${fLow.toFixed(1)} bps all-in at ${minus(elast[0])}, against ${fee0.toFixed(1)} bps today. ${where(fLow, elast[0])}${beyond(fLow)} From −1 up, revenue keeps rising with the fee.`
        : `About ${fLow.toFixed(1)} to ${fHigh.toFixed(1)} bps all-in, against ${fee0.toFixed(1)} bps today. ${where(fLow, elast[0])}${beyond(Math.max(fLow, fHigh))}`;
  const when =
    path === 'Flat'
      ? 'Not reached at flat volume. Pick a growth path to see a date.'
      : hit === null
        ? 'Not reached within ten years on this path.'
        : hit.index === 0
          ? 'Already reached.'
          : `About ${hit.index} months, around ${new Date(Date.UTC(Number(hit.month.slice(0, 4)), Number(hit.month.slice(5, 7)) - 1, 1)).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}. ${path} means volume changes by that much over 12 months, compounding monthly.${schedule.startsWith('1.6') ? ' Issuance follows the HSP-029 ramp.' : ''}`;

  return (
    <>
      <Gauge
        today={failed ? null : TODAY}
        max={25e9}
        thresholds={[{ at: v16, note: 'if the 1.6% vote passes' }, { at: v25, note: 'if issuance stays at 2.5%' }]}
        todayNote="last 30 days"
        gapCaption={`short each month at ${issuance}% issuance`}
        gapTo={v}
      />

      {failed && (
        <div className="m-err">
          <Banner tone="error" title="Could Not Load Today's Volume">
            The distance from today&apos;s volume is not shown. The threshold below still works, because it does not need it.
          </Banner>
        </div>
      )}

      <div className="model-grid">
        <div className="glass inputs">
          <Segmented label="HSP-029 Issuance Schedule" options={SCHEDULES} value={schedule} onChange={pickSchedule} />
          <Segmented label="Volume Growth Path" options={PATHS} value={path} onChange={setPath} />
          <Slider label="Issuance (Custom)" display={`${issuance.toFixed(1)}% a year`} min={0} max={4} step={0.1} value={issuance} onChange={setIssuance} ticks={['0%', '1.33%', '2.67%', '4%']} />
          <Slider label="NEAR Price" display={`$${price.toFixed(2)}`} min={2} max={8} step={0.01} value={price} onChange={setPrice} ticks={['$2', '$4', '$6', '$8']} />
          <Slider label="Elasticity (Assumed Range)" display={`${minus(elast[0])} to ${minus(elast[1])}`} min={E_MIN} max={E_MAX} step={0.01} range={elast} onRange={setElast} ticks={['−2.0', '−1.2', '−0.3', '+0.5']} />
          <p className="s-text">{elasticity ? `Starts at the measured 95% interval, ${minus(elasticity.lo)} to ${minus(elasticity.hi)} (1Click only). It moves the revenue-maximizing fee, not V* at today's fee.` : 'The elasticity estimate did not load, so this starts at an assumed range.'}</p>
          <Slider label="Share of Revenue Spent on Buybacks" display={`${buyback}%`} min={0} max={100} step={1} value={buyback} onChange={(x) => setBuyback(Math.max(1, x))} ticks={['0%', '33%', '67%', '100%']} />
        </div>

        <div className="glass result">
          <p className="s-title">Monthly Volume Needed</p>
          <p className="r-big" aria-live="polite">{bn(v)}</p>
          <p className="r-line">
            {failed
              ? "Today's volume did not load, so the multiple of today is not shown."
              : `${(v / TODAY).toFixed(1)}× today's ${bn(TODAY, 2)}. Interval ${bn(range.low)} to ${bn(range.high)}, from how far revenue per dollar of volume has moved. ${live ? `Inputs as of ${asOf.slice(0, 10)}.` : 'Sample inputs: the published file did not load.'} Elasticity does not move this number: at today's fee, volume stays where it is.`}
          </p>
          <hr />
          <div><p className="s-name">When It Is Reached</p><p className="r-text">{when}</p></div>
          <div><p className="s-name">Revenue-Maximizing Fee</p><p className="r-text">{maxFee}</p></div>
        </div>
      </div>
    </>
  );
}
