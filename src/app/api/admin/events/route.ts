import { eventSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { createEvent, listEvents } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ events: await listEvents() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, eventSchema);
    return ok(await createEvent(body), 201);
  } catch (error) {
    return fail(error);
  }
}
