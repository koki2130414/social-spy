import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import {
  adminLogin,
  registerParticipant,
  setParticipantAttendance,
  listAdminParticipants,
} from '@/server/service/admin';
import { getGameState, listVoteCandidates, loginParticipant } from '@/server/service/participant';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 参加者の画面に出る「参加者 N名」。
 *
 * ここが欠席込みの数だと、投票画面に並ぶ候補の数と合わない。
 * 当日「1人足りない、誰か隠れているのでは」と受け取られるので、
 * 画面に出す数と、実際に選べる人数をそろえる。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('画面に出る参加者の人数', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('欠席にした人は数に入らない', async () => {
    const { credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '数える人',
      loginId: '910',
    });
    const { participant: absent } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '来られなくなった人',
      loginId: '911',
    });

    const before = await getRepo().countAttendingParticipants(DEMO_EVENT_ID);
    await setParticipantAttendance(DEMO_EVENT_ID, absent.id, false);
    const after = await getRepo().countAttendingParticipants(DEMO_EVENT_ID);

    expect(after).toBe(before - 1);

    // 登録そのものは残っている（受付の記録を消してはいけない）
    const rows = await listAdminParticipants(DEMO_EVENT_ID);
    expect(rows.some((r) => r.id === absent.id)).toBe(true);
    expect(await getRepo().countParticipants(DEMO_EVENT_ID)).toBeGreaterThan(after);

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });
    const state = await getGameState();
    expect(state.participantCount).toBe(after);
  });

  it('画面に出る人数と、投票で選べる人数がそろっている', async () => {
    const { participant: me, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '投票する人',
      loginId: '912',
    });
    const { participant: absent } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '欠席の人',
      loginId: '913',
    });
    await setParticipantAttendance(DEMO_EVENT_ID, absent.id, false);

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });

    const state = await getGameState();
    const candidates = await listVoteCandidates();

    // 候補には自分が入らないぶんだけ少ない
    expect(candidates.length).toBe(state.participantCount - 1);
    expect(candidates.some((c) => c.id === absent.id)).toBe(false);
    expect(candidates.some((c) => c.id === me.id)).toBe(false);
  });
});
