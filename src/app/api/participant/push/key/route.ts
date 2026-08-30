import { vapidConfig } from '@/lib/env';
import { fail, ok } from '@/server/http';

export const dynamic = 'force-dynamic';

/** プッシュ通知の購読に必要な公開鍵。未設定なら null を返し、UI側で機能を隠す */
export async function GET() {
  try {
    const config = vapidConfig();
    return ok({ publicKey: config?.publicKey ?? null });
  } catch (error) {
    return fail(error);
  }
}
