// Stale data, sampler gap, load error. Always says the date and what is not shown (Figma: Banner).
// Default gold frame is for warnings; "neutral" is the quiet note (grey); "error" is a failed load (red).
export function Banner({ title, children, tone = 'warning' }: { title: string; children: string; tone?: 'warning' | 'neutral' | 'error' }) {
  return (
    <div className={`banner${tone === 'warning' ? '' : ` ${tone}`}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="bar" />
      <div>
        <p className="b-title">{title}</p>
        <p className="b-body">{children}</p>
      </div>
    </div>
  );
}
