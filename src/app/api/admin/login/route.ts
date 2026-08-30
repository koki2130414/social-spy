import { adminLoginSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { adminLogin } from '@/server/service/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, adminLoginSchema);
    const session = await adminLogin(body.email, body.password);
    return ok({ email: session.email, name: session.name, demo: session.demo });
  } catch (error) {
    return fail(error);
  }
}
