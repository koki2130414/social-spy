import { appUrl } from '@/lib/env';
import { fail, ok } from '@/server/http';
import { getDashboard, getEvent } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const event = await getEvent(eventId);
    const joinUrl = `${appUrl()}/join?code=${encodeURIComponent(event.code)}`;
    return ok(await getDashboard(eventId, joinUrl));
  } catch (error) {
    return fail(error);
  }
}
