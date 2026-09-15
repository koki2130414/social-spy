import { fail, ok } from '@/server/http';
import { getAdminRanking } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

/** 運営向けの達成率ランキング。権限確認はサービス層で行う */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { eventId } = await params;
    return ok(await getAdminRanking(eventId));
  } catch (error) {
    return fail(error);
  }
}

type Ctx = { params: Promise<{ eventId: string }> };
