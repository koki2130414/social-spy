import { voteSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { castVote } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, voteSchema);
    return ok(await castVote(body.targetId), 201);
  } catch (error) {
    return fail(error);
  }
}
