import { pushUnsubscribeSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { unsubscribeFromPush } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, pushUnsubscribeSchema);
    await unsubscribeFromPush(body.endpoint);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
