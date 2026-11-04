// S8 "Where Public Figures Disagree": our figure next to what public sources say. Pure and type-annotations only, so Node runs it in tests and the site imports it.
// Outside figures are written by hand below, each with its source, value and the date the source gave. Ours are summed from the saved DefiLlama files.
export type Other = { name: string; url?: string; value: string; date: string };
export type Row = { figure: string; ours: string; others: Other[]; why: string };
export type Inputs = {
  vstar: { priceUsd: number; at16: { mid: number } } | null; // thesis.json
  buybackShare: number | null; // model_inputs.json
  fees: { day: string; fees: number; revenue: number }[]; // data/snapshot/defillama_daily.json days
  volume: { day: string; defillama: number }[]; // data/snapshot/coverage.json daily
};

const NONE = 'Not available';
const billions = (n: number) => `$${(n / 1e9).toFixed(1)}B`;
const millions = (n: number) => `$${Math.round(n / 1e6)}M`;
const millionsTwo = (n: number) => `$${(n / 1e6).toFixed(2)}M`;
// Sum of one field over the days from..to, both included (ISO dates compare as text).
const sum = <T extends { day: string }>(rows: T[], from: string, to: string, key: keyof T) =>
  rows.filter((r) => r.day >= from && r.day <= to).reduce((t, r) => t + (r[key] as number), 0);

export function reconcileRows(i: Inputs): Row[] {
  const v = i.vstar;
  const revenue = i.fees.length ? sum(i.fees, '2026-02-23', '2026-10-18', 'revenue') : null;
  const volume = i.volume.length ? sum(i.volume, '0000-00-00', '2026-09-21', 'defillama') : null;
  return [
    {
      figure: 'Monthly Volume Needed at 1.6%',
      ours: v ? billions(v.at16.mid) : NONE,
      others: [{ name: 'The draft', value: '$15.8B', date: 'Undated draft, checked 30 Oct 2026' }],
      why: v ? `NEAR is $${v.priceUsd.toFixed(2)} now, not $4.97, and every dollar threshold moves with price.` : 'The price differs, and every dollar threshold moves with price.',
    },
    {
      figure: 'Daily Threshold',
      ours: v ? `${millions(v.at16.mid / (365.25 / 12))} a day` : NONE,
      others: [{ name: 'TronWeekly, citing a DefiLlama Pro page', value: 'About $177M a day', date: 'Apr 2026' }],
      why: 'NEAR was $1.35 then, and the method is not shown. The DefiLlama Pro page itself would not open for us.',
    },
    {
      figure: 'Buyback Share',
      ours:
        i.buybackShare != null
          ? `${Math.round(i.buybackShare * 100)}% of revenue (DefiLlama)${revenue != null ? `; ${millionsTwo(revenue)} of revenue from 23 Feb to 18 Oct 2026` : ''}`
          : NONE,
      others: [
        {
          name: 'Altcoin Buzz, citing DefiLlama and NearBlocks',
          url: 'https://www.altcoinbuzz.io/near-intents-has-bought-back-6-68m-of-near-using-fees',
          value: '$6.68M bought back since February. The buyback wallet holds 2.02M NEAR on NearBlocks but 1.51M NEAR on NEAR’s dashboard',
          date: '19 Oct 2026',
        },
      ],
      why: 'DefiLlama books all revenue as buybacks, so its buyback total is its revenue total for the same days. It shows revenue booked, not NEAR bought. The two wallet balances disagree and we have not checked the chain ourselves.',
    },
    {
      figure: 'Cumulative Volume',
      ours: volume != null ? `${billions(volume)} (DefiLlama daily volume, 1 Sep 2025 to 21 Sep 2026)` : NONE,
      others: [
        {
          name: 'Crypto Briefing, citing Dune',
          url: 'https://cryptobriefing.com/near-protocol-intents-30-billion-volume-record/',
          value: 'About $31.4B all time, of which about $29.5B public intents and about $1.9B confidential',
          date: '22 Sep 2026',
        },
      ],
      why: 'Our figure matches the public part. The extra $1.9B is confidential intents, which DefiLlama appears not to count (our reading, not confirmed). Our series starts on 1 Sep 2025, so any earlier volume is missing.',
    },
  ];
}
