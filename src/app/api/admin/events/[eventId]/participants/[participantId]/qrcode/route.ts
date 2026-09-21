import { fail, ok } from '@/server/http';
import { getParticipantQrCode } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string; participantId: string }> };

/**
 * 参加者1人ぶんのQRコード。
 *
 * 運営権限と、この参加者がこのイベントの人かどうかの確認は
 * サービス層（getParticipantQrCode）で行う。
 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId, participantId } = await params;
    return ok(await getParticipantQrCode(eventId, participantId));
  } catch (error) {
    return fail(error);
  }
}
