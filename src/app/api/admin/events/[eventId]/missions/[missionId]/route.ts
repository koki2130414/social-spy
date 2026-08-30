import { missionSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { deleteMission, updateMission } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string; missionId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { eventId, missionId } = await params;
    const body = await parseBody(request, missionSchema.partial());
    return ok(await updateMission(eventId, missionId, body));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { eventId, missionId } = await params;
    await deleteMission(eventId, missionId);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
