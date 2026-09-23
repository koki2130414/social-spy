import { participantRenameSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { renameParticipant } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string; participantId: string }> };

/**
 * 表示名を変える。
 *
 * 権限確認・重複の確認・この参加者がこのイベントの人かどうかの確認は
 * すべてサービス層（renameParticipant）で行う。
 */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { eventId, participantId } = await params;
    const body = await parseBody(request, participantRenameSchema);
    const participant = await renameParticipant(eventId, participantId, body.displayName);
    return ok({
      id: participant.id,
      displayName: participant.displayName,
    });
  } catch (error) {
    return fail(error);
  }
}
