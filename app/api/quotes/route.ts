import { getQuoteList } from '@/lib/data';

export const revalidate = 300;

// Every saved quote day with its size and SHA-256, the hash that attest:check compares with the chain.
export async function GET() {
  return Response.json({ days: await getQuoteList() });
}
