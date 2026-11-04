type Props = { href: string; children: string; className?: string; variant?: 'primary' | 'secondary' };

// One primary per screen (Figma: Button). The secondary is an outline with a dark chevron.
export function Button({ href, children, className = '', variant = 'primary' }: Props) {
  const dark = variant === 'secondary';
  return (
    <a className={`btn${dark ? ' btn-2' : ''} ${className}`} href={href}>
      <span>{children}</span>
      <span className="knob"><img src={dark ? '/assets/chevron-dark.svg' : '/assets/chevron.svg'} alt="" width={14} height={14} /></span>
    </a>
  );
}
