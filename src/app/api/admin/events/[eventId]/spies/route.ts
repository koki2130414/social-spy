import { spyAssignSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { autoAssignSpies, listAdminParticipants, setParticipantRole } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, spyAssignSchema);
    if (body.mode === 'auto') {
      await autoAssignSpies(eventId, body.count);
    } else {
      await setParticipantRole(eventId, body.participantId, body.role);
    }
    return ok({ participants: await listAdminParticipants(eventId) });
  } catch (error) {
    return fail(error);
  }
}
