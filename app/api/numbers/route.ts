import { getNumbers } from '@/lib/data';

export async function GET() {
  return Response.json(await getNumbers());
}
