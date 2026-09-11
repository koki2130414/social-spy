import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import {
  adminLogin,
  listAdminParticipants,
  registerParticipant,
  setParticipantAttendance,
} from '@/server/service/admin';
import { listVoteCandidates, loginParticipant } from '@/server/service/participant';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 当日のドタキャン対応。
 *
 * 受付に来なかった人を運営が「欠席」にする。行は消さずに印を付けるだけで、
 * その人はログイン・SPY抽選・投票・集計のすべてから外れる。
 *
 * ここで守りたいのは主に次の2つ。
 *  ・欠席にした人の番号とパスワードで入れないこと（カードを配ってあるため）
 *  ・欠席にした人が投票の候補に出ないこと
 *
 * SPY抽選から外れることは spy-selection.test.ts で確かめている。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

async function addParticipant(name: string, loginId: string) {
  return registerParticipant(DEMO_EVENT_ID, { displayName: name, loginId });
}

describe('欠席にした参加者', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('配ってある番号とパスワードで入れなくなる', async () => {
    const created = await addParticipant('来なかった人', '80');
    const credentials = {
      code: DEMO_EVENT_CODE,
      loginId: '80',
      password: created.credentials.password,
    };

    // まずは入れることを確かめる（テスト自体が空振りしていないことの確認）
    await expect(loginParticipant(credentials)).resolves.toMatchObject({
      participantId: created.participant.id,
    });

    cookieJar.clear();
    await loginAsAdmin();
    await setParticipantAttendance(DEMO_EVENT_ID, created.participant.id, false);

    await expect(loginParticipant(credentials)).rejects.toMatchObject({
      code: 'NOT_ATTENDING',
    });
  });

  it('「参加に戻す」でまた入れる（押し間違えても元に戻せる）', async () => {
    const created = await addParticipant('戻ってきた人', '81');
    await setParticipantAttendance(DEMO_EVENT_ID, created.participant.id, false);
    await setParticipantAttendance(DEMO_EVENT_ID, created.participant.id, true);

    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: '81',
        password: created.credentials.password,
      }),
    ).resolves.toMatchObject({ participantId: created.participant.id });
  });

  it('他の人の投票候補に出てこない', async () => {
    const absent = await addParticipant('欠席する人', '82');
    const voter = await addParticipant('投票する人', '83');

    await setParticipantAttendance(DEMO_EVENT_ID, absent.participant.id, false);

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '83',
      password: voter.credentials.password,
    });

    const candidates = await listVoteCandidates();
    expect(candidates.some((c) => c.id === absent.participant.id)).toBe(false);
    // 自分以外の出席者は候補に残っている
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.id === voter.participant.id)).toBe(false);
  });

  it('データは消えず、管理画面の一覧には欠席として残る', async () => {
    const created = await addParticipant('記録は残る人', '84');
    await setParticipantAttendance(DEMO_EVENT_ID, created.participant.id, false);

    const rows = await listAdminParticipants(DEMO_EVENT_ID);
    const row = rows.find((r) => r.id === created.participant.id);
    expect(row).toBeDefined();
    expect(row?.attending).toBe(false);
    expect(row?.displayName).toBe('記録は残る人');
  });

  it('別のイベントの参加者IDを渡しても欠席にできない', async () => {
    const repo = getRepo();
    const other = await repo.createEvent({
      name: '別会場',
      code: 'OTHER1',
      startsAt: new Date().toISOString(),
      durationMinutes: 60,
      spyRevealOffsetMinutes: 30,
      spyCount: 1,
      registrationOpen: true,
    });
    const outsider = await repo.createParticipant({
      eventId: other.id,
      displayName: 'よその人',
      affiliation: null,
    });

    await expect(setParticipantAttendance(DEMO_EVENT_ID, outsider.id, false)).rejects.toMatchObject(
      { code: 'PARTICIPANT_NOT_FOUND' },
    );

    // 巻き添えで書き換わっていないこと
    const after = await repo.getParticipant(outsider.id);
    expect(after?.attending).toBe(true);
  });
});
