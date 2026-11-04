// The site's only data reader. Pages call it on the server; Route Handlers expose it to the browser.
// It returns the prototype's sample figures until each unit replaces them with the published files.
// With GITHUB_DATA_TOKEN set, files come from GitHub (D24, cached 5 minutes), so new data shows without a redeploy.
// Without it, or when GitHub does not answer, they come from disk (what was built or checked out), and the log says so.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { anchorPanel, dayState, FAILED_PANEL, type AttestRecord, type DayCheck } from './attest_view';
import { listRepoDir, readRepoFile } from './github_data';
import { callView, type RpcTarget } from './near_view';
import { elasticityView, type ElasticityDoc } from './elasticity_view';
import { feeView } from './fee_view';
import { concentrationView, thesisView, type ConcentrationDoc, type ThesisDoc } from './thesis_view';
import { FALLBACK, type Market } from './model';
import { reconcileRows, type Row } from './reconcile_view';
import { freshness } from './status_view';
import { tokenBoardView, type TokenBoard } from './token_board_view';
import { anchorStates, commands, elasticity, fee as sampleFee, readings, sample } from './mock';

type FeeTrace = import('./fee_view').FeeTrace;

const token = () => process.env.GITHUB_DATA_TOKEN || null;

// Bytes of a file under the repo root: GitHub first when there is a token, disk otherwise. null = the file does not exist.
async function readData(rel: string): Promise<Uint8Array | null> {
  const t = token();
  if (t) {
    try {
      return await readRepoFile(rel, { token: t });
    } catch (e) {
      console.warn(`GitHub read failed for ${rel}, using the disk copy: ${(e as Error).message}`);
    }
  }
  return readFile(path.join(process.cwd(), rel)).catch(() => null);
}

async function readPublished<T>(name: string): Promise<T | null> {
  const bytes = await readData(`data/published/${name}`);
  try {
    return bytes ? (JSON.parse(Buffer.from(bytes).toString('utf8')) as T) : null;
  } catch {
    return null;
  }
}

async function listQuoteDays(): Promise<string[]> {
  const t = token();
  let names: string[] | null = null;
  if (t) {
    try {
      names = await listRepoDir('data/quotes', { token: t });
    } catch (e) {
      console.warn(`GitHub list failed for data/quotes, using the disk copy: ${(e as Error).message}`);
    }
  }
  names ??= await readdir(quotesDir()).catch(() => []);
  return names.filter((f) => f.endsWith('.jsonl')).map((f) => f.replace('.jsonl', ''));
}

// `few` previews AC-5.4: the real file with only 2 usable fee changes, through the same view code.
export async function getNumbers({ few = false } = {}) {
  const trace = await readPublished<FeeTrace>('fee_trace.json');
  const raw = await readPublished<ElasticityDoc>('elasticity.json');
  const el = raw && few ? { ...raw, main: { ...raw.main, usable: 2, e1: null } } : raw;
  const th = await readPublished<ThesisDoc>('thesis.json');
  const head = thesisView(th, sample, readings);
  return { sample: head.sample, readings: head.readings, headline: head, fee: feeView(trace, sampleFee), elasticity: elasticityView(el, elasticity) };
}

// S6: per-size integrator shares from thesis.json; sample text when the file is missing.
export async function getConcentration() {
  const th = await readPublished<ThesisDoc & { concentration?: ConcentrationDoc }>('thesis.json');
  return concentrationView(th, th?.readings.find((r) => r.id === 'Q4')?.detail ?? null);
}

// U4: the model's inputs from the published file; the fallback is flagged so the page can say so.
// The elasticity interval from U5 sets the Model page's elasticity slider (FR-10, FR-11); null when the file is missing.
export type ElasticityRange = { estimate: number; lo: number; hi: number } | null;
export async function getMarket(): Promise<{ market: Market; asOf: string; live: boolean; elasticity: ElasticityRange }> {
  const p = await readPublished<any>('model_inputs.json');
  const el = await readPublished<{ main?: { e1?: { estimate: number; lo: number; hi: number } | null } }>('elasticity.json');
  const elasticity = el?.main?.e1 ? { estimate: el.main.e1.estimate, lo: el.main.e1.lo, hi: el.main.e1.hi } : null;
  if (!p) return { market: FALLBACK, asOf: '2026-11-01T00:00:00Z', live: false, elasticity };
  return {
    live: true,
    asOf: p.asOf,
    elasticity,
    market: { supply: p.supply.now, revenueRate: p.revenueRate, revenueRateRange: p.revenueRateRange, gasBurnNearPerYear: p.issuance.gasBurnNearPerYear, todayVolume: p.volume30dUsd, priceUsd: p.priceUsd, feeBps: p.feeBpsOfVolume },
  };
}

// S8: our side of the figures that public sources disagree on, from the published file `verify` checks. Missing file: every "Ours" cell says "Not available".
export async function getReconciliation() {
  const doc = await readPublished<{ rows: Row[] }>('reconciliation.json');
  return doc?.rows ?? reconcileRows({ vstar: null, buybackShare: null, fees: [], volume: [] });
}

// AC-2.3: the chain spot checks (pipeline/spot_check.mjs), one row per sampled day: what matched and why the rest only partly did.
export async function getSpotChecks() {
  const bytes = await readData('data/snapshot/spot-checks.json');
  if (!bytes) return null;
  const doc = JSON.parse(Buffer.from(bytes).toString('utf8')) as { scope: string; results: { day: string; verdict: string; why: string | null; usdGap: number | null }[] };
  const days = [...new Set(doc.results.map((r) => r.day))].sort();
  return {
    scope: doc.scope,
    rows: days.map((day) => {
      const r = doc.results.filter((x) => x.day === day), n = (v: string) => r.filter((x) => x.verdict === v).length;
      const why = [...new Set(r.filter((x) => x.verdict !== 'match').map((x) => x.why).filter(Boolean))];
      const gap = Math.max(...r.map((x) => Math.abs(x.usdGap ?? 0)));
      return { day, checked: r.length, match: n('match'), nearOnly: n('near-only match'), mismatch: n('mismatch') + n('inconclusive'), gap, why };
    }),
  };
}

// FR-21 coverage board: which routes the quote archive samples, against 1Click's volume. null when the file is missing.
export async function getTokenBoard() {
  return tokenBoardView(await readPublished<TokenBoard>('token_board.json'));
}

// FR-20 feeds. The thesis feed is the published file as it is stored, so it cannot differ from what the Headline page reads.
export async function getThesisBytes() {
  return readData('data/published/thesis.json');
}

// Quote days with size and SHA-256 (the hash attest:check compares with the chain), and one day's file as stored.
export async function getQuoteList() {
  const days = (await listQuoteDays()).sort();
  const files = await Promise.all(days.map(async (day) => ({ day, bytes: await readData(`data/quotes/${day}.jsonl`) })));
  return files.flatMap((f) => (f.bytes ? [{ day: f.day, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex') }] : []));
}

export async function getQuoteDay(day: string) {
  return readData(`data/quotes/${day}.jsonl`);
}

// NFR-6: freshness from the last frozen day, plus the hash of the published numbers.
export async function getStatus() {
  const bytes = await readData('data/published/thesis.json');
  const th = bytes ? (JSON.parse(Buffer.from(bytes).toString('utf8')) as { asOf: string; snapshotLastDay?: string | null }) : null;
  const lastFrozenDay = th?.snapshotLastDay ?? null;
  return {
    lastRefresh: th?.asOf ?? null,
    lastFrozenDay,
    publishedSha256: bytes && createHash('sha256').update(bytes).digest('hex'),
    ...freshness(lastFrozenDay, new Date()),
  };
}

// S5 and /api/attest read the real contract; the hash comes from the same quote file attest:check uses.
const quotesDir = () => path.join(process.cwd(), 'data', 'quotes');

async function readDeployment() {
  const d = JSON.parse(await readFile(path.join(process.cwd(), 'contract', 'deployment.json'), 'utf8'));
  return { rpcUrl: d.rpcUrl as string, contractId: d.contractId as string };
}

async function checkDay(day: string, target: RpcTarget): Promise<DayCheck> {
  const bytes = await readData(`data/quotes/${day}.jsonl`);
  const record: AttestRecord | null = await callView('get', { day }, target);
  return { day, local: bytes && createHash('sha256').update(bytes).digest('hex'), record };
}

export async function getAnchorPanel() {
  let current = FAILED_PANEL;
  try {
    const target = await readDeployment();
    const lastDay: string | null = await callView('last_day', {}, target);
    const days = (await listQuoteDays()).filter((d) => lastDay && d <= lastDay);
    if (lastDay && !days.includes(lastDay)) days.push(lastDay);
    const checks = await Promise.all(days.map((d) => checkDay(d, target)));
    current = anchorPanel(checks, `https://testnet.nearblocks.io/address/${target.contractId}`);
  } catch {
    // Testnet did not answer: the page says so instead of guessing.
  }
  return { current, anchorStates, commands };
}

export async function getAttestation(day: string) {
  const target = await readDeployment();
  const check = await checkDay(day, target);
  return {
    day,
    state: dayState(check),
    contract: target.contractId,
    archiveSha256: check.local,
    onChainSha256: check.record?.archive_sha256 ?? null,
    readings: check.record?.readings ?? null,
    blockTimestamp: check.record?.block_timestamp ?? null,
  };
}
