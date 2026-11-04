import type { Status } from '@/lib/mock';

// The dot's shape carries the side as well as its colour (Figma: Reading cell).
const dot: Record<Status, { src: string; color: string }> = {
  'Not Measured': { src: '/assets/dot-not-measured.svg', color: 'var(--text-muted)' },
  Bullish: { src: '/assets/dot-bullish.svg', color: 'var(--bullish)' },
  Neutral: { src: '/assets/dot-neutral.svg', color: 'var(--neutral)' },
  Bearish: { src: '/assets/dot-bearish.svg', color: 'var(--bearish)' },
};

export function ReadingCell({ name, detail, status }: { name: string; detail: string; status: Status }) {
  const d = dot[status];
  return (
    <div className="reading">
      <div>
        <p className="name">{name}</p>
        <p className="detail">{detail}</p>
      </div>
      <div className="status" style={{ color: d.color }}>
        <img src={d.src} alt="" width={9} height={9} />
        <span>{status}</span>
      </div>
    </div>
  );
}
