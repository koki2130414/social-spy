import { participantCreateSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { listAdminParticipants, registerParticipant } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok({ participants: await listAdminParticipants(eventId) });
  } catch (error) {
    return fail(error);
  }
}

/** 運営が参加者を代理登録する */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, participantCreateSchema);
    const { participant, joinUrl, credentials } = await registerParticipant(eventId, {
      displayName: body.displayName,
      affiliation: body.affiliation || null,
      loginId: body.loginId || null,
    });
    return ok(
      {
        id: participant.id,
        displayName: participant.displayName,
        affiliation: participant.affiliation,
        joinUrl,
        loginId: credentials.loginId,
        // 平文パスワードを返すのはこの応答だけ。保存されるのはハッシュのみ
        password: credentials.password,
      },
      201,
    );
  } catch (error) {
    return fail(error);
  }
}
