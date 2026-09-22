import { z } from 'zod';
import { fail, ok, parseBody } from '@/server/http';
import { setEventArchived } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

const schema = z.object({ archived: z.boolean() });

/** イベントをしまう／戻す。記録は消えない */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, schema);
    return ok(await setEventArchived(eventId, body.archived));
  } catch (error) {
    return fail(error);
  }
}
