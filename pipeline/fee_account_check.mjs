// AC-3.3: what is the account that 1Click quotes name as the app-fee recipient? Reads public NEAR RPC only, no key.
// Writes data/published/fee_account.json with the facts the chain shows. It does not decide who owns the account.
import { writeFileSync, mkdirSync } from 'node:fs';

const ACCOUNT = '5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd';
const RPC = process.env.NEAR_RPC ?? 'https://rpc.mainnet.near.org';

async function rpc(params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params }) });
  return r.json();
}
async function view(method, args) {
  const j = await rpc({ request_type: 'call_function', finality: 'final', account_id: 'intents.near', method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(j.result.result).toString());
}

const nearAccount = await rpc({ request_type: 'view_account', finality: 'final', account_id: ACCOUNT });
const keys = await rpc({ request_type: 'view_access_key_list', finality: 'final', account_id: ACCOUNT });
const tokens = await view('mt_tokens_for_owner', { account_id: ACCOUNT });
const ids = tokens.map((t) => t.token_id);
const balances = await view('mt_batch_balance_of', { account_id: ACCOUNT, token_ids: ids });
const held = ids.filter((_, i) => balances[i] !== '0');
const pick = (id) => balances[ids.indexOf(id)] ?? '0';

const result = {
  checkedAt: new Date().toISOString(),
  account: ACCOUNT,
  existsAsNearAccount: !nearAccount.error,
  nearAccessKeys: keys.result?.keys?.length ?? 0,
  intentsAssetsListed: ids.length,
  intentsAssetsWithBalance: held.length,
  usdcEthereumRaw: pick('nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near'),
  usdtEthereumRaw: pick('nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near'),
  wrappedNearRaw: pick('nep141:wrap.near'),
  conclusion: 'Collects fees inside intents.near across many assets, with small balances. Not a NEAR account, so it has no NEAR keys. The chain does not show who controls its Intents key, so NEAR ownership is not established.',
};
mkdirSync('data/published', { recursive: true });
writeFileSync('data/published/fee_account.json', JSON.stringify(result, null, 1) + '\n');
console.log(result);
