import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { resolveVoteFailure } from './vote-recovery';

/**
 * 投票送信が失敗して見えたときの扱い。
 *
 * 会場の電波は途切れやすく、「送信は届いたのに返事だけ失われる」が起きる。
 * このとき失敗と伝えると、参加者は投票できていないと思って
 * もう一度やり直そうとする。人生で一度きりの投票なので混乱が大きい。
 * 本当にサーバーへ残っているかを見てから判断する。
 */

describe('投票が失敗して見えたとき', () => {
  it('返事が届かなかっただけで、サーバーには残っている場合は成功として扱う', async () => {
    const result = await resolveVoteFailure(
      new ApiError('NETWORK', '通信できません', 0),
      async () => true,
    );

    expect(result).toEqual({ kind: 'recorded' });
  });

  it('本当に届かなかった場合は、もう一度促す', async () => {
    const result = await resolveVoteFailure(
      new ApiError('NETWORK', '通信できません', 0),
      async () => false,
    );

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.message).toContain('もう一度');
    }
  });

  it('確認そのものができなかった場合も、もう一度促す', async () => {
    const result = await resolveVoteFailure(
      new ApiError('NETWORK', '通信できません', 0),
      async () => {
        throw new Error('確認もできない');
      },
    );

    expect(result.kind).toBe('failed');
  });

  it('サーバーが理由を返している場合は、その理由をそのまま伝える', async () => {
    const result = await resolveVoteFailure(
      new ApiError('VOTE_CLOSED', '投票は締め切られました。', 400),
      async () => false,
    );

    expect(result).toEqual({ kind: 'failed', message: '投票は締め切られました。' });
  });

  it('サーバーの理由付きでも、実際に記録されていれば成功として扱う', async () => {
    // 二重送信を弾かれた場合。1回目が通っているので失敗ではない
    const result = await resolveVoteFailure(
      new ApiError('ALREADY_VOTED', '既に投票済みです。', 409),
      async () => true,
    );

    expect(result).toEqual({ kind: 'recorded' });
  });
});
