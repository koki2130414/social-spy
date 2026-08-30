import { notificationSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { createNotification, listNotifications } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok({ notifications: await listNotifications(eventId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, notificationSchema);
    return ok(await createNotification({ ...body, eventId }), 201);
  } catch (error) {
    return fail(error);
  }
}
