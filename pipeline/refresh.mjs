// The refresh job (U8, FR-16): pulls DefiLlama and model inputs, rebuilds every published file, and records side changes.
// Freezing a chain day is chain-day.yml's job (T2). Token names for the coverage board come from ft_metadata here (T6).
// A file whose numbers did not change (only its timestamp did) is put back byte for byte, so git sees no change and no commit is made.
// Usage: node pipeline/refresh.mjs [--dry-run] [--message-file <path>]
//   --dry-run        runs everything, prints what would change, then restores all files (nothing is written)
//   --message-file   where to write the alarm text; pipeline/telegram.mjs sends it after the commit has been pushed
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { sideChanges, alarmMessage } from '../analysis/alarm.mjs';

const { values: args } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, 'message-file': { type: 'string' } } });
const dry = args['dry-run'];
const HISTORY = 'alarm/history.json';
const LLAMA = 'data/snapshot/defillama_daily.json';
const COW = 'data/snapshot/cow_daily.json';
const P = 'data/published';
const VENUES = 'data/snapshot/control_venues.json';
const TOKENS = 'data/labels/tokens.json';
const FILES = [LLAMA, COW, VENUES, TOKENS, `${P}/model_inputs.json`, `${P}/thesis.json`, `${P}/reconciliation.json`, `${P}/token_board.json`, HISTORY];

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const backup = new Map(FILES.map((f) => [f, read(f)]));
const restore = (f) => { const old = backup.get(f); if (old !== null) writeFileSync(f, old); };

// Same numbers? Timestamps that change on every run are ignored.
const VOLATILE = ['asOf', 'pulledAt'];
const core = (text) => { const o = JSON.parse(text); for (const k of VOLATILE) delete o[k]; return JSON.stringify(o); };
const changed = (f) => backup.get(f) === null || core(backup.get(f)) !== core(readFileSync(f, 'utf8'));

function node(script, ...a) {
  const r = spawnSync(process.execPath, [script, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${script} failed:\n${(r.stderr || r.stdout).split('\n').slice(0, 8).join('\n')}`);
  return r.stdout;
}

const kept = [];
function settle(f) {
  if (changed(f)) kept.push(f);
  else restore(f);
}

try {
  // Inputs first: the derived files read the settled copies, so verify can rebuild them.
  // A flaky outside source must not stop the run: keep the previous copy, say so, and try again next hour.
  for (const s of ['pipeline/pull_defillama.mjs', 'pipeline/model_inputs.mjs', 'pipeline/token_names.mjs']) {
    try { node(s); } catch (e) { console.log(`WARNING: ${s} failed, the previous copy is kept.\n${String(e.message).split('\n').filter((l) => /^Error: http|: \d{3}$|ECONN|TIMEOUT|terminated/.test(l)).join('\n')}`); }
  }
  settle(LLAMA);
  settle(COW);
  settle(VENUES);
  settle(`${P}/model_inputs.json`);
  if (existsSync(TOKENS)) settle(TOKENS);

  node('pipeline/build_thesis.mjs');
  node('pipeline/build_reconciliation.mjs');
  node('pipeline/build_token_board.mjs');
  for (const f of ['thesis', 'reconciliation', 'token_board']) settle(`${P}/${f}.json`);

  const before = backup.get(`${P}/thesis.json`) && JSON.parse(backup.get(`${P}/thesis.json`));
  const after = JSON.parse(readFileSync(`${P}/thesis.json`, 'utf8'));
  const changes = sideChanges(before, after, new Date().toISOString());

  if (changes.length) {
    const message = alarmMessage(changes);
    console.log(`\nALARM: ${changes.length} side change${changes.length === 1 ? '' : 's'}\n${message}`);
    const history = JSON.parse(backup.get(HISTORY) ?? '[]');
    mkdirSync(dirname(HISTORY), { recursive: true });
    writeFileSync(HISTORY, JSON.stringify([...history, ...changes], null, 1) + '\n');
    kept.push(HISTORY);
    if (args['message-file'] && !dry) writeFileSync(args['message-file'], message + '\n');
  } else console.log('\nNo side changed, no alarm.');

  console.log(kept.length ? `\nChanged: ${kept.join(', ')}` : '\nNothing changed, nothing to commit.');
} finally {
  if (dry) for (const f of FILES) { const old = backup.get(f); if (old === null) rmSync(f, { force: true }); else writeFileSync(f, old); }
}
if (dry) console.log('(dry run: every file was put back)');
