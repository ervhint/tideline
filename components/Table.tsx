import { CSSProperties, ReactNode } from 'react';

// Figma "Cost split" table: label header row, rows divided by a track line. widths are the Figma px, used as proportions so the table never overflows its panel.
export function Table({ head, widths, rows }: { head: string[]; widths: number[]; rows: ReactNode[][] }) {
  const cols = widths.map((w) => `minmax(0, ${w}fr)`).join(' ');
  return (
    <div className="tbl" style={{ '--cols': cols } as CSSProperties}>
      <div className="t-head">{head.map((h) => <p key={h}>{h}</p>)}</div>
      {rows.map((r, i) => (
        <div className="t-row" key={i}>
          {r.map((c, j) => <div key={j} className={j === 0 ? 't-first' : 't-cell'} data-l={j === 0 ? undefined : head[j]}>{c}</div>)}
        </div>
      ))}
    </div>
  );
}
