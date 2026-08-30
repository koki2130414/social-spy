import { missionSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { createMission, listMissions } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok({ missions: await listMissions(eventId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, missionSchema);
    return ok(await createMission({ ...body, eventId }), 201);
  } catch (error) {
    return fail(error);
  }
}
