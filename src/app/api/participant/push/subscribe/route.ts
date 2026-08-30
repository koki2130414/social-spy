import { pushSubscribeSchema } from '@/lib/validation';
import { isPushConfigured } from '@/lib/env';
import { ServiceError } from '@/server/errors';
import { fail, ok, parseBody } from '@/server/http';
import { subscribeToPush } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isPushConfigured()) {
      throw new ServiceError('PUSH_DISABLED', 'プッシュ通知は設定されていません。', 503);
    }
    const body = await parseBody(request, pushSubscribeSchema);
    await subscribeToPush(body);
    return ok({ ok: true }, 201);
  } catch (error) {
    return fail(error);
  }
}
