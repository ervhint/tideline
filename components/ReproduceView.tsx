'use client';
import { useEffect, useState } from 'react';
import { Banner } from './Banner';
import { RetryButton } from './ErrorSwap';
import type { getAnchorPanel } from '@/lib/data';
import type { AnchorState } from '@/lib/mock';

const DOT = { none: '/assets/dot-not-measured.svg', anchored: '/assets/dot-bullish.svg', mismatch: '/assets/dot-bearish.svg' };
const COLOR = { none: 'var(--text-muted)', anchored: 'var(--bullish)', mismatch: 'var(--bearish)' };

function Copy({ text, onCopied }: { text: string; onCopied: (t: string) => void }) {
  return (
    <button
      type="button"
      className="btn btn-2"
      aria-label={`Copy ${text}`}
      onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); onCopied(text); }}
    >
      <span>Copy</span>
      <span className="knob"><img src="/assets/chevron-dark.svg" alt="" width={14} height={14} /></span>
    </button>
  );
}

export function ReproduceView({ current, anchorStates, commands }: Awaited<ReturnType<typeof getAnchorPanel>>) {
  // The page shows the real contract. `?state=anchored`, `?state=mismatch` and `?state=error`
  // preview the designed states with example values.
  const [preview, setPreview] = useState<AnchorState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('state');
    if (q === 'anchored' || q === 'mismatch') setPreview(q);
    if (q === 'error') setPreviewFailed(true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const failed = previewFailed || current.state === 'failed';
  const a = preview ? { ...anchorStates[preview], day: '2026-11-10', contractUrl: 'https://testnet.nearblocks.io' } : current;
  const state = (preview ?? current.state) as keyof typeof DOT; // 'failed' renders the Banner below instead
  return (
    <div className="repro">
      <div className="cmds">
        {commands.map((c) => (
          <div className="cmd-row" key={c.cmd}>
            <div className="cmd" style={{ width: c.width }}>
              <code>{c.cmd}</code>
              <span>{c.example}</span>
            </div>
            <Copy text={c.cmd} onCopied={setToast} />
          </div>
        ))}
      </div>

      {failed ? (
        <div className="anchor">
          <Banner tone="error" title="NEAR Testnet Did Not Answer">
            NEAR testnet did not answer, so the anchored status is not shown. The verify command still works without it.
          </Banner>
          <RetryButton>Try Again</RetryButton>
        </div>
      ) : (
      <div className="glass anchor">
        <p className="a-title">Daily Hash on NEAR Testnet</p>
        <div className="tag" style={{ color: COLOR[state] }}>
          <img src={DOT[state]} alt="" width={9} height={9} />
          <span>{a.tag}</span>
        </div>
        <p className="a-text">{a.text}</p>
        {state === 'none' ? (
          <>
            <div className="legend" style={{ color: COLOR.anchored }}>
              <img src={DOT.anchored} alt="" width={9} height={9} /><span>Anchored: shown here when it applies</span>
            </div>
            <div className="legend" style={{ color: COLOR.mismatch }}>
              <img src={DOT.mismatch} alt="" width={9} height={9} /><span>Mismatch: shown here when it applies</span>
            </div>
          </>
        ) : (
          <>
            <p className="hash">Archive hash   {a.archive}</p>
            <p className="hash">On-chain hash  {a.chain}</p>
            <a className="a-link" href={a.contractUrl}>Open the Contract on NEAR Testnet</a>
            {state === 'mismatch' && (
              <>
                <p className="hash">Next step: npm run attest:check {a.day}</p>
                <a className="a-link" href="https://github.com/ervhint/tideline/issues">Report It on GitHub</a>
              </>
            )}
          </>
        )}
      </div>
      )}
      {toast && <div className="toast" role="status">Copied: {toast}</div>}
    </div>
  );
}
