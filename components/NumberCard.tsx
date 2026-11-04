// Every published number: value, one plain sentence, source and date, query link (Figma: Number card).
export function NumberCard({ value, label, text, source, href }: { value: string; label: string; text: string; source: string; href: string }) {
  return (
    <div className="numcard">
      <p className="n-value num">{value}</p>
      <p className="n-label">{label}</p>
      <p className="n-text">{text}</p>
      <a className="n-link" href={href}>{source}</a>
    </div>
  );
}
