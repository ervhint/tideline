// Shared fetch helpers for the pulls that talk to outside sources.
// DefiLlama's server usually answers in under 1 s, but sometimes hangs until Cloudflare gives up (524 after about 125 s) or answers 502.
// A hung call never recovers, so the limit is short and the retries are many: the next try normally answers at once.

export async function retry(label, fn, { tries = 6, waitMs = 2_000 } = {}) {
  for (let n = 1; ; n++) {
    try { return await fn(); } catch (e) {
      if (n === tries) throw new Error(`${label}: ${e.cause?.code ?? e.message} (after ${tries} tries)`);
      await new Promise((r) => setTimeout(r, waitMs * n));
    }
  }
}

export const getJson = (url, { timeoutMs = 20_000, ...retryOpts } = {}) => retry(url, async () => {
  const r = await fetch(url, { headers: { 'user-agent': 'tideline' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}, retryOpts);
