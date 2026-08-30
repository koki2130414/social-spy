import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/env';
import { getRepo } from '@/server/repo';
import { setParticipantSession, verifyJoinToken } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

/**
 * 運営が発行した参加用リンクの入口。
 *
 * 署名を検証し、その参加者としてのセッションを発行して /game へ送る。
 * 署名が壊れている・参加者が削除済みの場合は通常の参加登録画面へ戻す。
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { token } = await params;
  const base = appUrl();

  const payload = verifyJoinToken(token);
  if (!payload) {
    return NextResponse.redirect(`${base}/join?error=invalid-link`);
  }

  // 参加者が実在し、リンクに書かれたイベントのままかを確認する
  const participant = await getRepo().getParticipant(payload.pid);
  if (!participant || participant.eventId !== payload.eid) {
    return NextResponse.redirect(`${base}/join?error=invalid-link`);
  }

  await setParticipantSession(participant.id, participant.eventId);
  return NextResponse.redirect(`${base}/game`);
}
