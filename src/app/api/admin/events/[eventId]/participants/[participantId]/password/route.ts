import { fail, ok } from '@/server/http';
import { resetParticipantPassword } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string; participantId: string }> };

/** パスワードを再発行する（忘れた・紙をなくした参加者への当日対応） */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { eventId, participantId } = await params;
    return ok(await resetParticipantPassword(eventId, participantId));
  } catch (error) {
    return fail(error);
  }
}
