import { fail, ok } from '@/server/http';
import { getResultForParticipant } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(await getResultForParticipant());
  } catch (error) {
    return fail(error);
  }
}
