import { appMode, isDemoModeEnabled } from '@/lib/env';
import { ServiceError } from '@/server/errors';
import { fail, ok } from '@/server/http';
import { resetDemoState } from '@/server/repo/demo-repo';
import { clearAdminSession, clearParticipantSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (!isDemoModeEnabled() || appMode() !== 'demo') {
      throw new ServiceError('DEMO_DISABLED', 'デモモードは無効です。', 403);
    }
    resetDemoState();
    await clearParticipantSession();
    await clearAdminSession();
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
