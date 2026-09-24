import { fail, okRevalidate } from '@/server/http';
import { listVoteCandidates } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 投票先の顔ぶれは変わらない。開き直しても本文は送らない
    return okRevalidate(request, { candidates: await listVoteCandidates() });
  } catch (error) {
    return fail(error);
  }
}
