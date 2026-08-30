import { fail, ok } from '@/server/http';
import { distributeMissions } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok(await distributeMissions(eventId));
  } catch (error) {
    return fail(error);
  }
}
