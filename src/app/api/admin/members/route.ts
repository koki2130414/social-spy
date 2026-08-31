import { memberInviteSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { inviteAdminMember, listAdminMembers } from '@/server/service/members';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok({ members: await listAdminMembers() });
  } catch (error) {
    return fail(error);
  }
}

/** 運営メンバーを招待する */
export async function POST(request: Request) {
  try {
    const body = await parseBody(request, memberInviteSchema);
    return ok(await inviteAdminMember(body.email), 201);
  } catch (error) {
    return fail(error);
  }
}
