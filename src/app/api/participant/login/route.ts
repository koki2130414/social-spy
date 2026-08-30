import { participantLoginSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { loginParticipant } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

/** 運営が発行したIDとパスワードでのログイン */
export async function POST(request: Request) {
  try {
    const body = await parseBody(request, participantLoginSchema);
    const result = await loginParticipant({
      code: body.code,
      loginId: body.loginId,
      password: body.password,
    });
    return ok(result, 200);
  } catch (error) {
    return fail(error);
  }
}
