import { fail, okRevalidate } from '@/server/http';
import { getGameState } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 変わっていなければ本文を送らない（会場の回線を空ける）
    return okRevalidate(request, await getGameState());
  } catch (error) {
    return fail(error);
  }
}
