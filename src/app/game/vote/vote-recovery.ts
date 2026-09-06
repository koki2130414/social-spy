import { ApiError } from '@/lib/api';

/**
 * 投票送信が失敗して見えたときに、本当に失敗なのかを見分ける。
 *
 * 会場の電波は途切れやすく、「送信はサーバーに届いたのに、返事だけ失われる」
 * ことがある。見た目の失敗だけで判断すると、実際は投票済みなのに
 * 参加者へ失敗と伝えてしまい、二度投票しようとして混乱する。
 * 投票は一度きりなので、必ずサーバーの状態を見てから伝える。
 */

export type VoteFailureResult = { kind: 'recorded' } | { kind: 'failed'; message: string };

/** 電波が届かなかったときの案内。原因を伝えて、次の行動を示す */
export const VOTE_RETRY_MESSAGE = '電波が届かず送信できませんでした。もう一度お試しください。';

export async function resolveVoteFailure(
  error: unknown,
  checkRecorded: () => Promise<boolean>,
): Promise<VoteFailureResult> {
  // 確認そのものが失敗することもある。その場合は投票できていない扱いにする
  let recorded = false;
  try {
    recorded = await checkRecorded();
  } catch {
    recorded = false;
  }
  if (recorded) return { kind: 'recorded' };

  // サーバーが理由を返しているならそれを見せる。
  // status 0 はサーバーまで届いていないので、こちらの言葉で案内する
  if (error instanceof ApiError && error.status !== 0) {
    return { kind: 'failed', message: error.message };
  }
  return { kind: 'failed', message: VOTE_RETRY_MESSAGE };
}
