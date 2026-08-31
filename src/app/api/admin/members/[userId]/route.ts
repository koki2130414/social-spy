import { fail, ok } from '@/server/http';
import { revokeAdminMember } from '@/server/service/members';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

/** 運営権限を外す（アカウント自体は削除しない） */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { userId } = await params;
    await revokeAdminMember(userId);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
