import { joinSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { joinEvent } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, joinSchema);
    const result = await joinEvent({
      code: body.code,
      displayName: body.displayName,
      affiliation: body.affiliation || null,
    });
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
