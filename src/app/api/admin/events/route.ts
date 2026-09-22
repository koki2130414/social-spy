import { eventSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { createEvent, listEventSummaries, listEvents } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // ?summary=1 で、参加者数・投票数つきの一覧（イベント管理画面用）
    if (new URL(request.url).searchParams.get('summary')) {
      return ok({ events: await listEventSummaries() });
    }
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
