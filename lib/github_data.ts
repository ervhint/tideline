// Reads data files from the private GitHub repo with a read-only token (D24). Server only; the token never reaches the browser.
// Type annotations only, so Node runs it in tests.
export type GitHubSource = { token: string; repo?: string; ref?: string; fetchFn?: typeof fetch };

const API = 'https://api.github.com';
const CACHE_SECONDS = 300;

async function call(path: string, accept: string, { token, repo = 'ervhint/tideline', ref = 'main', fetchFn = fetch }: GitHubSource) {
  const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const res = await fetchFn(url, {
    headers: { authorization: `Bearer ${token}`, accept, 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: CACHE_SECONDS },
  } as RequestInit);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res;
}

// The file's bytes exactly as committed (the quote hashes depend on it), or null when the file is not in the repo.
export async function readRepoFile(path: string, src: GitHubSource): Promise<Uint8Array | null> {
  const res = await call(path, 'application/vnd.github.raw+json', src);
  return res && new Uint8Array(await res.arrayBuffer());
}

// File names in a folder, or null when the folder is not in the repo.
export async function listRepoDir(path: string, src: GitHubSource): Promise<string[] | null> {
  const res = await call(path, 'application/vnd.github+json', src);
  if (!res) return null;
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`GitHub: ${path} is not a folder`);
  return items.filter((i: { type: string }) => i.type === 'file').map((i: { name: string }) => i.name);
}
