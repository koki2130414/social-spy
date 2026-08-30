import { demoPersonaSchema } from '@/lib/validation';
import { isDemoModeEnabled, demoAdminCredentials, appMode } from '@/lib/env';
import { ServiceError } from '@/server/errors';
import { fail, ok, parseBody } from '@/server/http';
import { setAdminSession, setParticipantSession } from '@/server/auth/session';
import {
  DEMO_ADMIN_ID,
  DEMO_AGENT_PARTICIPANT_ID,
  DEMO_EVENT_ID,
  DEMO_SPY_PARTICIPANT_ID,
} from '@/server/demo/seed';

export const dynamic = 'force-dynamic';

function assertDemo() {
  if (!isDemoModeEnabled() || appMode() !== 'demo') {
    throw new ServiceError('DEMO_DISABLED', 'デモモードは無効です。', 403);
  }
}

export async function POST(request: Request) {
  try {
    assertDemo();
    const { persona } = await parseBody(request, demoPersonaSchema);

    if (persona === 'admin') {
      await setAdminSession({
        uid: DEMO_ADMIN_ID,
        email: demoAdminCredentials().email,
        name: 'DEMO CONTROL',
        demo: true,
      });
      return ok({ redirect: '/admin' });
    }

    const pid = persona === 'spy' ? DEMO_SPY_PARTICIPANT_ID : DEMO_AGENT_PARTICIPANT_ID;
    await setParticipantSession(pid, DEMO_EVENT_ID);
    return ok({ redirect: '/game' });
  } catch (error) {
    return fail(error);
  }
}
