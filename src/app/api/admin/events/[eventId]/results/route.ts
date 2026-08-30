import { fail, ok } from '@/server/http';
import { getAdminResult } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok(await getAdminResult(eventId));
  } catch (error) {
    return fail(error);
  }
}
