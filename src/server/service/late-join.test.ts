import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { adminLogin, changePhase, createNotification } from '@/server/service/admin';
import { getGameState, joinEvent } from '@/server/service/participant';
import { setParticipantSession } from '@/server/auth/session';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 当日、遅れて来た人の受付。
 *
 * 受付用の共通QRから入る人は、開始してから来ることのほうが多い。
 * 以前はSPY MISSION公開（開始45分後）で締め切っていたため、
 * そのあとに来た人は受付で断られていた。
 *
 * 投票が始まったら締め切る。そこから先は集計が動き出すので、
 * あとから人が増えると誰も投票していない人が混ざってしまう。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('遅れて来た人の受付', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('SPY MISSION公開後でも入れて、MISSIONが配られる', async () => {
    await changePhase(DEMO_EVENT_ID, 'ACTIVE');
    await changePhase(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED');

    cookieJar.clear();
    const joined = await joinEvent({
      code: DEMO_EVENT_CODE,
      displayName: '遅れて来た人',
      affiliation: null,
    });

    await setParticipantSession(joined.participantId, joined.eventId);
    const state = await getGameState();

    // 自分のMISSIONが配られていないと、来ても何もできない
    expect(state.missions.filter((m) => m.kind === 'GENERAL').length).toBeGreaterThan(0);
    // あとから入った人はSPYにはならない
    expect(state.me.role).toBe('AGENT');
  });

  it('投票が始まったら締め切る', async () => {
    await changePhase(DEMO_EVENT_ID, 'ACTIVE');
    await changePhase(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED');
    await changePhase(DEMO_EVENT_ID, 'VOTING');

    cookieJar.clear();
    await expect(
      joinEvent({ code: DEMO_EVENT_CODE, displayName: '間に合わなかった人', affiliation: null }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
  });
});

describe('お知らせも、イベントの変化として参加者へ伝わる', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  /**
   * 参加者の端末は events の変化だけを見ている（購読1本）。
   * Realtime は「1つの変化 × 見ている人数」だけ通信が発生するので、
   * 2本見ていると101人の会場では1回のフェーズ変更で202通になり、
   * 無料プランの上限（毎秒100通）を超えて一部の端末に届かなくなる。
   *
   * 1本に減らしたぶん、お知らせを出したときもサーバー側で
   * events を触って同じ合図に乗せる必要がある。ここが抜けると
   * お知らせが最大15秒遅れて出るようになる。
   */
  it('お知らせを出すと、イベント側も触る', async () => {
    const touched = vi.spyOn(getRepo(), 'touchEvent');

    await createNotification({
      eventId: DEMO_EVENT_ID,
      title: 'テスト',
      body: '本文',
      kind: 'INFO',
    });

    expect(touched).toHaveBeenCalledWith(DEMO_EVENT_ID);
    touched.mockRestore();
  });

  /** フェーズ変更は events をすでに更新しているので、二重に触らない（通数が倍になる） */
  it('フェーズ変更では二重に触らない', async () => {
    const touched = vi.spyOn(getRepo(), 'touchEvent');

    await changePhase(DEMO_EVENT_ID, 'ACTIVE');

    expect(touched).not.toHaveBeenCalled();
    touched.mockRestore();
  });
});
