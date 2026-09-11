import { participantAttendanceSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { setParticipantAttendance } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string; participantId: string }> };

/**
 * 当日の出欠を切り替える（ドタキャン対応）。
 *
 * 権限確認と、この参加者がこのイベントの人かどうかの確認は
 * サービス層（setParticipantAttendance）で行う。
 */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { eventId, participantId } = await params;
    const body = await parseBody(request, participantAttendanceSchema);
    const participant = await setParticipantAttendance(eventId, participantId, body.attending);
    return ok({
      id: participant.id,
      displayName: participant.displayName,
      attending: participant.attending,
    });
  } catch (error) {
    return fail(error);
  }
}
