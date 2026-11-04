import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every frontend label has an https evidence link (AC-2.4)', () => {
  const { labels } = JSON.parse(readFileSync(new URL('../data/labels/frontends.json', import.meta.url)));
  assert.ok(labels.length > 0);
  for (const l of labels) assert.match(l.evidence, /^https:\/\//, l.referral);
});

test('every account label (revenue wallets, fee collector) has an https evidence link (AC-2.4)', () => {
  const { labels } = JSON.parse(readFileSync(new URL('../data/labels/accounts.json', import.meta.url)));
  assert.ok(labels.some((l) => l.kind === 'revenue wallet'));
  for (const l of labels) {
    assert.match(l.evidence, /^https:\/\//, l.account);
    assert.ok(['sourced', 'secondary'].includes(l.confidence), l.account);
  }
});

test('T-3.3 the day-1 fee account 5880ad2b…47dd: whether it is a revenue account is stated, with evidence', () => {
  const { labels } = JSON.parse(readFileSync(new URL('../data/labels/accounts.json', import.meta.url)));
  const a = labels.find((l) => l.account.startsWith('5880ad2b'));
  assert.ok(a, 'the account has a label');
  assert.match(a.evidence, /^https:\/\//);
  assert.notEqual(a.kind, 'revenue wallet', 'not counted as NEAR revenue while ownership is unproven');
  assert.match(a.note, /not established/);
  const check = JSON.parse(readFileSync(new URL('../data/published/fee_account.json', import.meta.url)));
  assert.equal(check.account, a.account);
  assert.equal(typeof check.conclusion, 'string');
});
