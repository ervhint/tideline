// Reads the quote archive and writes data/published/fee_trace.json (U3). Set QUOTES_DIR / OUT to write elsewhere.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { nearShare, traceArchive } from '../analysis/fee_trace.mjs';

const dir = process.env.QUOTES_DIR ?? 'data/quotes';
const out = process.env.OUT ?? 'data/published/fee_trace.json';
const upto = process.env.QUOTES_UPTO; // verify re-runs on the quotes that existed when the file was written
const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl') && (!upto || f.slice(0, 10) <= upto.slice(0, 10))).sort();
const rows = files.flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => !upto || r.sampledAt <= upto);
const protocol = JSON.parse(readFileSync('data/snapshot/protocol_fee.json', 'utf8'));
const groups = traceArchive(rows, protocol.feeBps);

// NEAR's part of the app fees on executed 1Click swaps, last 30 days of data/snapshot/near_fees (one file per frozen day).
const feeFiles = readdirSync('data/snapshot/near_fees').filter((f) => f.endsWith('.csv.gz')).sort();
const feeRows = feeFiles.flatMap((f) => gunzipSync(readFileSync(`data/snapshot/near_fees/${f}`)).toString().split('\n').slice(1).filter(Boolean).map((l) => {
  const [day, bucket, , usd_in, app_fee_usd, near_fee_usd] = l.split(',');
  return { day, bucket, usd_in: +usd_in, app_fee_usd: +app_fee_usd, near_fee_usd: +near_fee_usd };
}));
const near = nearShare(feeRows, feeFiles.at(-1).slice(0, 10));
const sampled = rows.map((r) => r.sampledAt).sort();
const result = {
  asOf: sampled.at(-1), from: sampled[0], files, quotes: rows.length, groups,
  protocolFee: { bps: protocol.feeBps, collector: protocol.collector, source: protocol.source, readAt: protocol.readAt.at },
  nearShare: { ...near, source: 'Explorer, 1Click only: app fees the Explorer lists as paid to the revenue wallets in data/labels/accounts.json (its recipient names are labels, not always the receiving account on chain)', buyback: 'Since 2026-02-23 NEAR uses its captured Intents revenue to buy NEAR on the open market; the bought NEAR is not burned (DefiLlama methodology)' },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`${rows.length} quotes from ${files.length} files -> ${out}`);
