'use client';
import { useEffect, useState } from 'react';
import { Banner } from './Banner';
import type { Freshness } from '@/lib/status_view';

// NFR-6: the "Data Is Late" banner shows when the data really is late (`real`, worked out on the server).
// `?state=stale` previews the same banner with the same dates, and `/?state=loading` greys S1's numbers into skeleton blocks.
export function StateBanner({ real, preview }: { real: Freshness; preview: Freshness }) {
  const [state, setState] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state');
    setState(q);
    if (q === 'loading') { document.body.dataset.state = 'loading'; document.body.setAttribute('aria-busy', 'true'); } // screen readers wait too
    return () => { delete document.body.dataset.state; document.body.removeAttribute('aria-busy'); };
  }, []);
  const f = real.stale ? real : state === 'stale' ? preview : null;
  if (!f) return null;
  return (
    <div className="stale">
      <Banner title={f.title}>{f.body}</Banner>
    </div>
  );
}
