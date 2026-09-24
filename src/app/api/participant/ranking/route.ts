import { fail, okRevalidate } from '@/server/http';
import { getRanking } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

/**
 * クエストの達成率ランキング。
 *
 * 返すのは表示名と達成率だけで、role は含まない。
 * SPY MISSION を含めるかはサーバー側でフェーズから決まる。
 */
export async function GET(request: Request) {
  try {
    // 順位は動かないことが多い。変わっていなければ本文を送らない
    return okRevalidate(request, await getRanking());
  } catch (error) {
    return fail(error);
  }
}
