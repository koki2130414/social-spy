import { eventSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { deleteEvent, getEvent, updateEvent } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok(await getEvent(eventId));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, eventSchema.partial());
    return ok(await updateEvent(eventId, body));
  } catch (error) {
    return fail(error);
  }
}

/**
 * イベントを完全に消す。
 *
 * 投票が入っているイベントは、サービス側が断る（記録を守るため）。
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok(await deleteEvent(eventId));
  } catch (error) {
    return fail(error);
  }
}
