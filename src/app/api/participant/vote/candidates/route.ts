import { fail, ok } from '@/server/http';
import { listVoteCandidates } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ candidates: await listVoteCandidates() });
  } catch (error) {
    return fail(error);
  }
}
