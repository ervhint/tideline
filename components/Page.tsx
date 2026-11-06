import { ReactNode } from 'react';
import { Stale } from './Stale';

export function Page({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <main className="wrap page-lift">
      <h1 className="title">{title}</h1>
      {lead && <p className="lead-muted">{lead}</p>}
      <Stale />
      {children}
      <Footnote />
    </main>
  );
}

export function Footnote() {
  return (
    <p className="footnote">Tideline is research, not financial advice.</p>
  );
}
