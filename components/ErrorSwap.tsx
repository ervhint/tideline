'use client';
import { ReactNode, useEffect, useState } from 'react';

// Previews of the designed error states, until real load failures exist: add `?state=error` to the page address.
// Shows `error` in place of `normal` (Figma: "S2/S3/S5 ... error").
export function ErrorSwap({ normal, error }: { normal: ReactNode; error: ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(new URLSearchParams(window.location.search).get('state') === 'error');
  }, []);
  return <>{failed ? error : normal}</>;
}

// Secondary pill that reloads the page without the preview switch ("Try Again", "Show Last Good Sample").
export function RetryButton({ children }: { children: string }) {
  return (
    <button type="button" className="btn btn-2" onClick={() => { window.location.href = window.location.pathname; }}>
      <span>{children}</span>
      <span className="knob"><img src="/assets/chevron-dark.svg" alt="" width={14} height={14} /></span>
    </button>
  );
}
