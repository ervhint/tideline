'use client';
import { useEffect, useRef, useState } from 'react';

type Card = { value: string; label: string; text: string; source: string };

// The Number card whose value opens "About This Number" (Figma: Number sheet). Esc or Close shuts it.
export function NumberSheet({ card, explain, href, query }: { card: Card; explain: string; href: string; query: string }) {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const shut = () => {
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      <div className="numcard">
        <button ref={opener} className="n-value n-open num" onClick={() => setOpen(true)} aria-haspopup="dialog">{card.value}</button>
        <p className="n-label">{card.label}</p>
        <p className="n-text">{card.text}</p>
        <a className="n-link" href={href}>{card.source}</a>
      </div>
      {open && (
        <>
          <div className="scrim" onClick={shut} />
          <aside className="sheet" role="dialog" aria-modal="true" aria-label="About this number">
            <div className="sheet-top">
              <p className="small-label">About This Number</p>
              <button ref={close} className="btn btn-2" onClick={shut}>
                <span>Close</span>
                <span className="knob"><img src="/assets/chevron-dark.svg" alt="" width={14} height={14} /></span>
              </button>
            </div>
            <p className="sheet-value num">{card.value}</p>
            <p className="n-label">{card.label}</p>
            <p className="p-body">{explain}</p>
            <p className="n-text">{query}</p>
            <a className="n-link" href={href}>Open the Query</a>
          </aside>
        </>
      )}
    </>
  );
}
