import { getStatus } from '@/lib/data';

export const dynamic = 'force-dynamic'; // freshness is about now, so never serve a cached answer

// NFR-6: the last frozen day, the last quote sample, whether that is late, and the hash of the published numbers.
export async function GET() {
  return Response.json(await getStatus());
}
