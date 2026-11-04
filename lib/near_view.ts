// A read-only contract call over public RPC. No key. Used by the site and by attest:check.
const RPC_TIMEOUT_MS = 15_000;

export type RpcTarget = { rpcUrl: string; contractId: string; fetchFn?: typeof fetch };

export async function callView(method: string, args: object, { rpcUrl, contractId, fetchFn = fetch }: RpcTarget) {
  const res = await fetchFn(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'near-view',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      },
    }),
  });
  const body = await res.json();
  const error = body.error ?? body.result?.error;
  if (error) throw new Error(`RPC error: ${JSON.stringify(error)}`);
  if (!Array.isArray(body.result?.result)) throw new Error(`Unexpected RPC reply (HTTP ${res.status})`);
  return JSON.parse(Buffer.from(body.result.result).toString('utf8'));
}
