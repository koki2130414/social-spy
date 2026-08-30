import { clearParticipantSession } from '@/server/auth/session';
import { fail, ok } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await clearParticipantSession();
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
