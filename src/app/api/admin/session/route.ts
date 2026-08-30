import { getAdminSession } from '@/server/auth/session';
import { fail, ok } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) return ok({ authenticated: false }, 200);
    return ok({
      authenticated: true,
      email: session.email,
      name: session.name,
      demo: session.demo,
    });
  } catch (error) {
    return fail(error);
  }
}
