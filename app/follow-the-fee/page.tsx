import { Banner } from '@/components/Banner';
import { ErrorSwap, RetryButton } from '@/components/ErrorSwap';
import { NumberSheet } from '@/components/NumberSheet';
import { Page } from '@/components/Page';
import { getNumbers } from '@/lib/data';

// Swatches: App Fee dark, Withdraw Fee (sample: Solver Spread) blue, Unexplained muted (Figma, version B).
const swatch: Record<string, string> = { app: 'var(--action)', spread: 'var(--accent)', withdraw: 'var(--accent)', protocol: 'var(--text-muted)', unexplained: 'var(--text-muted)' };

export const revalidate = 300; // re-read the published data every 5 minutes

export default async function FollowTheFee() {
  const { fee } = await getNumbers();
  const bar = fee.parts.filter((p) => p.share);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lastGood = fee.asOf ? `${Number(fee.asOf.slice(8, 10))} ${MONTHS[Number(fee.asOf.slice(5, 7)) - 1]} ${fee.asOf.slice(0, 4)}` : null;
  return (
    <Page title="What a $10,000 Swap Costs" lead={<ErrorSwap normal={fee.lead} error="No figures are shown, because the data did not load." />}>
      <ErrorSwap
        error={
          <div className="err-body">
            <Banner tone="error" title="Swaps Did Not Load">
              {`The file of realised swaps did not load. Nothing is shown rather than a guess.${lastGood ? ` The last good figures cover the chain days to ${lastGood}.` : ''}`}
            </Banner>
            <div className="err-actions">
              <RetryButton>Try Again</RetryButton>
              {lastGood && <RetryButton>{`Show Last Good Figures (to ${lastGood})`}</RetryButton>}
            </div>
          </div>
        }
        normal={<>
      <div className="s2-grid">
        <div className="glass split num">
          <p className="s-title">Of the {fee.total}, Where It Goes</p>
          <div className="cbar" role="img" aria-label={bar.map((p) => `${p.value} ${p.name}`).join(', ')}>
            <p className="abs strong" style={{ left: 0, top: 0 }}>All-In {fee.total}</p>
            <p className="abs small" style={{ left: 0, top: 26 }}>{fee.card.value} below the outside price</p>
            <div className="callout">
              <p className="strong">{fee.spreadNote}</p>
              <p className="small">{fee.spreadSub}</p>
              <span className="ctick" />
            </div>
            <div className="ctrack">
              {bar.map((p) => (
                <span key={p.key} style={{ flexGrow: p.share, minWidth: p.minPx, background: swatch[p.key] }} />
              ))}
            </div>
            <div className="cscale">{['0%', '25%', '50%', '75%', '100%'].map((t) => <span key={t}>{t}</span>)}</div>
          </div>
          {fee.parts.map((p) => (
            <div className="s-row" key={p.key}>
              {p.share ? <span className="sw" style={{ background: swatch[p.key] }} /> : <img src="/assets/ring.svg" alt="" width={14} height={14} />}
              <p className={`s-val${p.share ? '' : ' dim'}`}>{p.value}</p>
              <div>
                <p className="s-name">{p.name}</p>
                <p className="s-text">{p.text}</p>
              </div>
            </div>
          ))}
          <a className="s-query" href="/reproduce/">Open the Query</a>
        </div>
        <NumberSheet
          card={fee.card}
          href="/reproduce/"
          explain={fee.explain}
          query={fee.query}
        />
      </div>
      <div className="split-foot">
        <Banner tone="neutral" title="Unexplained Part Is Shown, Never Hidden">{fee.bannerText}</Banner>
      </div>
        </>}
      />
    </Page>
  );
}
