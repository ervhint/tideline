import { getAttestation } from '@/lib/data';

export const revalidate = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  try {
    return Response.json(await getAttestation(day));
  } catch {
    return Response.json({ day, error: 'NEAR testnet did not answer' }, { status: 502 });
  }
}
