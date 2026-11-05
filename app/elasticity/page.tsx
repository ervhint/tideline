import { Button } from '@/components/Button';
import { Banner } from '@/components/Banner';
import { ErrorSwap, RetryButton } from '@/components/ErrorSwap';
import { IntervalPlot } from '@/components/IntervalPlot';
import { Page } from '@/components/Page';
import { getNumbers } from '@/lib/data';

// Axis runs from the first day read to the last (Figma: ticks on a date axis). Without the file it shows the sample's span.
const SAMPLE_AXIS = { start: '2025-09-01', end: '2026-10-29', labels: [['Sep 2025', '2025-09-01'], ['Dec 2025', '2025-12-01'], ['Mar 2026', '2026-03-01'], ['Jun 2026', '2026-06-01'], ['Sep 2026', '2026-09-01']] as [string, string][] };

export const revalidate = 300; // re-read the published data every 5 minutes

// `?state=few` previews the page with under 3 usable fee changes (AC-5.4); `?state=error` is the failed load.
export default async function Elasticity({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { elasticity } = await getNumbers({ few: (await searchParams).state === 'few' });
  const days = elasticity.days ?? [];
  const ax = elasticity.axis ?? SAMPLE_AXIS;
  const start = Date.parse(ax.start), end = Date.parse(ax.end);
  const pos = (d: string) => ((Date.parse(d) - start) / (end - start)) * 100;
  const labels = ax.labels;
  return (
    <Page title="Does Volume Leave When Fees Rise?">
      <ErrorSwap
        error={
          <div className="err-body">
            <Banner tone="error" title="Fee-Change List Did Not Load">
              The fee-change list did not load. No result is shown, and no earlier result is reused.
            </Banner>
            <div className="err-actions"><RetryButton>Try Again</RetryButton></div>
          </div>
        }
        normal={<>
      <div className="e-top">
        <div className="empty">
          <p className="e-head">{elasticity.head}</p>
          {elasticity.empty.split(String.fromCharCode(10)).map((l) => <p key={l} className="e-text" style={{ marginTop: 12 }}>{l.split('**').map((t, i) => (i % 2 ? <b key={i}>{t}</b> : t))}</p>)}
        </div>
        {elasticity.plot && <IntervalPlot {...elasticity.plot} />}
      </div>
        <div className="e-checks">
          <p className="s-title">{elasticity.live ? 'Checks' : 'What It Will Take to Tell'}</p>
          {elasticity.checks.map((c) => (
            <div key={c.name}>
              <p className="s-name">{c.name}</p>
              <p className="s-text">{c.text}</p>
            </div>
          ))}
        </div>

      <figure className="chart" aria-label={`${days.length} fee changes on a date axis`}>
        <p className="abs strong" style={{ left: 40, top: 24 }}>{elasticity.live ? `${days.length} Frozen Fee Changes` : `${days.length} Raw Fee Changes`}</p>
        <p className="abs small" style={{ left: 40, top: 52 }}>
          {elasticity.caption ?? 'Each tick will be one fee change, re-found from chain data. None is frozen yet.'}
        </p>
        <div className="axis">
          <span className="atrack" />
          {days.map((d, i) => <span key={i} className="atick" style={{ left: `${pos(d)}%` }} />)}
          {labels.map(([t, d], i) => (
            <span key={t} className={i % 2 ? 'lab-skip' : undefined}>
              <span className="amark" style={{ left: `${pos(d)}%` }} />
              <span className={i === 0 ? 'alabel first' : 'alabel'} style={{ left: `${pos(d)}%` }}>{t}</span>
            </span>
          ))}
        </div>
        <div className="mde">{elasticity.mde ?? 'Smallest effect it could see: shown here once the list is frozen'}</div>
      </figure>

      <Button href="/model/" variant="secondary">Use the Full Range in the Model</Button>
        </>}
      />
    </Page>
  );
}
