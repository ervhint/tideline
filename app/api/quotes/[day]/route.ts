import { getQuoteDay } from '@/lib/data';

export const revalidate = 300;

// One day's quote file, byte for byte, so anyone can hash it and compare with the chain.
export async function GET(_request: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  const bytes = await getQuoteDay(day);
  if (!bytes) return Response.json({ error: `no quotes saved for ${day}` }, { status: 404 });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
}
