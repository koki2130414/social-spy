import { missionCompleteSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { setMissionCompleted } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, missionCompleteSchema);
    return ok(await setMissionCompleted(body.assignmentId, body.completed));
  } catch (error) {
    return fail(error);
  }
}
