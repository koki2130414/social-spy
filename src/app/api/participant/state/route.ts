import { fail, ok } from '@/server/http';
import { getGameState } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(await getGameState());
  } catch (error) {
    return fail(error);
  }
}
