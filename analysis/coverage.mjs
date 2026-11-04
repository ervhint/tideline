// AC-2.2: compares the raw Explorer pull with DefiLlama per UTC day and reports data quality. Pure: days of raw swaps and
// DefiLlama's daily volume in, the report out. Reads total volume per day only, never per frontend, so it stays blind to fee events.
const DAY = 86_400;
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

// days: [{ day, swaps: [{ ts, usdIn, intentHash }] }] in day order (any iterable, so the caller can read one day at a time); llamaByDay: Map day -> USD.
export function coverageReport(days, llamaByDay) {
  const seen = new Set();
  let duplicates = 0, noHash = 0;
  const daily = [];
  for (const { day, swaps } of days) {
    const start = Date.parse(`${day}T00:00:00Z`) / 1000;
    let rows = 0, usd = 0, outside = 0, badUsd = 0;
    for (const r of swaps) {
      if (!r.intentHash) noHash++;
      else if (seen.has(r.intentHash)) { duplicates++; continue; }
      else seen.add(r.intentHash);
      rows++;
      if (r.ts < start || r.ts >= start + DAY) outside++;
      if (Number.isFinite(r.usdIn)) usd += r.usdIn; else badUsd++;
    }
    const defillama = llamaByDay.get(day) ?? null;
    daily.push({ day, rows, usd: Math.round(usd), outside, badUsd, defillama: defillama && Math.round(defillama), coverage: defillama ? Number((usd / defillama).toFixed(3)) : null });
  }
  const both = daily.filter((d) => d.defillama);
  const months = {};
  for (const d of both) (months[d.day.slice(0, 7)] ??= []).push(d);
  return {
    days: daily.length, rows: sum(daily.map((d) => d.rows)), duplicates, noHash,
    rowsOutsideTheirDay: sum(daily.map((d) => d.outside)), rowsWithBadUsd: sum(daily.map((d) => d.badUsd)),
    emptyDays: daily.filter((d) => !d.rows).map((d) => d.day),
    overallCoverage: Number((sum(both.map((d) => d.usd)) / sum(both.map((d) => d.defillama))).toFixed(3)),
    byMonth: Object.entries(months).map(([month, ds]) => ({ month, coverage: Number((sum(ds.map((d) => d.usd)) / sum(ds.map((d) => d.defillama))).toFixed(3)), usd: sum(ds.map((d) => d.usd)), defillama: sum(ds.map((d) => d.defillama)) })),
    daily,
  };
}
