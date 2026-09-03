import { adminSetupSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { completeAdminSetup } from '@/server/service/members';

export const dynamic = 'force-dynamic';

/**
 * パスワード設定リンクからの呼び出し。
 * ログイン前に使うため、署名付きトークンで本人性を確認する。
 */
export async function POST(request: Request) {
  try {
    const body = await parseBody(request, adminSetupSchema);
    await completeAdminSetup(body.token, body.password);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
