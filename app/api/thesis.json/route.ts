import { getThesisBytes } from '@/lib/data';

export const revalidate = 300;

// The published file as stored: the Headline page reads the same file, so the two cannot differ.
export async function GET() {
  const bytes = await getThesisBytes();
  if (!bytes) return Response.json({ error: 'thesis.json is not available' }, { status: 503 });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
