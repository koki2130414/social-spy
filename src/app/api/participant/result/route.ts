import { fail, okRevalidate } from '@/server/http';
import { getResultForParticipant } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 開き直しても、変わっていなければ本文を送らない
    return okRevalidate(request, await getResultForParticipant());
  } catch (error) {
    return fail(error);
  }
}
