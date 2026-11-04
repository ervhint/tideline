// V* = (issuance - gas burn) / (revenue rate x buyback share): the monthly Intents volume at which buybacks cover issuance (E5).
// Type annotations only, so Node runs this file directly (tests, `npm run model`) and the browser imports it too.
// Inputs come from data/published/model_inputs.json (pipeline/model_inputs.mjs); the figures below are only a fallback.

export type Market = {
  supply: number; // NEAR in total supply
  revenueRate: number; // NEAR revenue per dollar of volume (30-day, DefiLlama)
  revenueRateRange: { min: number; max: number }; // lowest and highest rolling 30-day rate: V*'s interval
  gasBurnNearPerYear: number;
  todayVolume: number; // monthly volume, last 30 finished days
  priceUsd: number;
  feeBps?: number; // all-in fee per dollar of volume today (DefiLlama fees over volume, 30 days)
};
export type Inputs = { issuancePct: number; price: number; buybackShare: number };

// Fallback only: used when the published file cannot be read. Values from 1 Nov 2026.
export const FALLBACK: Market = {
  supply: 1310.52e6,
  revenueRate: 5.49e-4,
  revenueRateRange: { min: 1.31e-4, max: 5.58e-4 },
  gasBurnNearPerYear: 0.49e6,
  todayVolume: 3.86e9,
  priceUsd: 4.41,
};

export const issuancePerMonthUsd = (i: Inputs, m: Market) => ((i.issuancePct / 100) * m.supply * i.price) / 12;
export const gasBurnPerMonthUsd = (i: Inputs, m: Market) => (m.gasBurnNearPerYear * i.price) / 12;

export function vStar(i: Inputs, m: Market, rate: number = m.revenueRate): number {
  const need = issuancePerMonthUsd(i, m) - gasBurnPerMonthUsd(i, m);
  return Math.max(0, need) / (rate * i.buybackShare);
}

// The interval comes from how much the revenue rate has moved: a higher rate needs less volume.
export function vStarRange(i: Inputs, m: Market): { low: number; mid: number; high: number } {
  return { low: vStar(i, m, m.revenueRateRange.max), mid: vStar(i, m), high: vStar(i, m, m.revenueRateRange.min) };
}

// HSP-029: the NEAR Forum thread (gov.near.org, topic 42644) shows "Status: Succeeded" on 3 Nov 2026; the tally and its date are not on that page.
// Then a 90-day grace period, then issuance falls in a straight line from 2.5% to 1.6% over 24 months. It also needs a validator upgrade
// (the proposal says a House of Stake vote alone cannot change it). If it is not adopted, issuance stays at 2.5%.
export const HSP029 = { voteClose: '2026-11-02', bufferDays: 90, rampMonths: 24, from: 2.5, to: 1.6 };

export function issuancePctOn(date: Date, votePasses: boolean): number {
  if (!votePasses) return HSP029.from;
  const start = Date.parse(HSP029.voteClose + 'T00:00:00Z') + HSP029.bufferDays * 86_400_000;
  const rampMs = HSP029.rampMonths * (365.25 / 12) * 86_400_000;
  const t = Math.min(1, Math.max(0, (date.getTime() - start) / rampMs));
  return HSP029.from + (HSP029.to - HSP029.from) * t;
}

export type PathPoint = { month: string; issuancePct: number; vStar: number; volume: number; reached: boolean };

// V* month by month under one vote outcome, next to a volume path that changes by `yearlyFactor` over 12 months,
// compounding monthly. `from` is the first month (UTC, first of the month). `fixedPct` holds issuance flat (Custom).
export function vStarPath(
  m: Market, price: number, buybackShare: number, votePasses: boolean, yearlyFactor: number,
  from: Date, months = 60, fixedPct?: number,
): PathPoint[] {
  const out: PathPoint[] = [];
  for (let k = 0; k < months; k++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + k, 1));
    const issuancePct = fixedPct ?? issuancePctOn(d, votePasses);
    const v = vStar({ issuancePct, price, buybackShare }, m);
    const volume = m.todayVolume * Math.pow(yearlyFactor, k / 12);
    out.push({ month: d.toISOString().slice(0, 7), issuancePct, vStar: v, volume, reached: volume >= v });
  }
  return out;
}

// First month in the path where volume covers V*, or null. Whole months from the first point.
export function firstReached(path: PathPoint[]): { index: number; month: string } | null {
  const i = path.findIndex((p) => p.reached);
  return i < 0 ? null : { index: i, month: path[i].month };
}

// Elasticity only matters if the fee moves (FR-10, FR-11). Volume at fee f follows ((f + shift) / (f0 + shift))^e, the form PREREG.md
// section 3 estimates (shift 5 bps), and NEAR keeps the same share of each fee, so its revenue per dollar scales with f / f0.
export const FEE_SHIFT_BPS = 5;
export const MAX_SEEN_FEE_BPS = 110; // the largest fee in the frozen events; beyond it the estimate says nothing

// The fee that maximizes revenue f x volume(f): f* = shift / (-1 - e) when e < -1. At -1 or above, revenue keeps rising with the fee
// inside the fees the events covered, so there is no maximum to report (null).
export function revenueMaxFeeBps(e: number, shift: number = FEE_SHIFT_BPS): number | null {
  return e < -1 ? shift / (-1 - e) : null;
}

// At an all-in fee of `feeBps`: the volume to expect, and the V* that fee needs (a higher fee means more revenue per dollar).
export function atFee(i: Inputs, m: Market, feeBps: number, e: number) {
  const f0 = m.feeBps ?? 15.4;
  const volume = m.todayVolume * Math.pow((feeBps + FEE_SHIFT_BPS) / (f0 + FEE_SHIFT_BPS), e);
  const need = vStar(i, m, (m.revenueRate * feeBps) / f0);
  return { feeBps, volume, need, multiple: need / volume };
}
