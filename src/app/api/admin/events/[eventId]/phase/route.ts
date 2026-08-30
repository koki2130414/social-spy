import { phaseSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { changePhase, listPhaseHistory } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok({ history: await listPhaseHistory(eventId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    const body = await parseBody(request, phaseSchema);
    return ok(await changePhase(eventId, body.to));
  } catch (error) {
    return fail(error);
  }
}
