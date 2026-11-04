import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listRepoDir, readRepoFile } from './github_data.ts';

const reply = (status, body, json) => async (url, init) => {
  reply.last = { url, init };
  return { status, ok: status < 300, arrayBuffer: async () => body, json: async () => json };
};

test('readRepoFile asks for the raw bytes with the token and returns them unchanged', async () => {
  const bytes = new Uint8Array([0x7b, 0x0d, 0x0a, 0x7d]); // includes CRLF: must not be rewritten
  const out = await readRepoFile('data/published/thesis.json', { token: 't0k', fetchFn: reply(200, bytes.buffer) });
  assert.deepEqual([...out], [...bytes]);
  assert.equal(reply.last.url, 'https://api.github.com/repos/ervhint/tideline/contents/data/published/thesis.json?ref=main');
  assert.equal(reply.last.init.headers.authorization, 'Bearer t0k');
  assert.equal(reply.last.init.headers.accept, 'application/vnd.github.raw+json');
});

test('a missing file is null, other failures throw', async () => {
  assert.equal(await readRepoFile('x', { token: 't', fetchFn: reply(404) }), null);
  await assert.rejects(readRepoFile('x', { token: 't', fetchFn: reply(403) }), /GitHub 403/);
});

test('listRepoDir returns file names only', async () => {
  const items = [{ type: 'file', name: '2026-11-01.jsonl' }, { type: 'dir', name: 'sub' }];
  assert.deepEqual(await listRepoDir('data/quotes', { token: 't', fetchFn: reply(200, null, items) }), ['2026-11-01.jsonl']);
  assert.equal(await listRepoDir('nope', { token: 't', fetchFn: reply(404) }), null);
});
