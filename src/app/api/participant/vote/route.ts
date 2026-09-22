import { voteSchema } from '@/lib/validation';
import { fail, ok, parseBody } from '@/server/http';
import { castVotes } from '@/server/service/participant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, voteSchema);
    return ok(await castVotes(body.targetIds), 201);
  } catch (error) {
    return fail(error);
  }
}
