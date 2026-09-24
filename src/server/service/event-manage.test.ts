import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import {
  adminLogin,
  changePhase,
  createEvent,
  deleteEvent,
  listEventSummaries,
  registerParticipant,
  setEventArchived,
} from '@/server/service/admin';
import { castVotes } from '@/server/service/participant';
import { setParticipantSession } from '@/server/auth/session';
import {
  DEMO_EVENT_ID,
  DEMO_SPY_PARTICIPANT_ID,
  DEMO_AGENT_PARTICIPANT_ID,
} from '@/server/demo/seed';

/**
 * イベントの管理（一覧・追加・しまう・消す）。
 *
 * 当日いちばん怖いのは、記録の残っているイベントを誤って消すこと。
 * 投票は消せない決まり（votes の削除禁止トリガ）なので、
 * 投票のあるイベントを消そうとすると半分だけ消えた状態になりうる。
 * そうならないよう、サービス側で先に断る。
 *
 * ここで守りたいのは次の4つ。
 *  ・運営としてログインしていないと何もできないこと
 *  ・一覧に過去のイベントも出て、人数と投票数が分かること
 *  ・投票が入ったイベントは消せないこと（しまうのは可）
 *  ・しまっても記録が消えないこと
 */

const NEW_EVENT = {
  name: 'テスト交流会',
  code: 'TESTEV',
  startsAt: '2026-10-01T10:00:00.000Z',
  durationMinutes: 90,
  spyRevealOffsetMinutes: 45,
  spyCount: 2,
  spyMissionPublic: true,
  registrationOpen: true,
};

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('イベント管理', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('一覧に人数と投票数が出る', async () => {
    const rows = await listEventSummaries();
    const demo = rows.find((r) => r.id === DEMO_EVENT_ID);

    expect(demo).toBeDefined();
    expect(demo!.participantCount).toBeGreaterThan(0);
    expect(demo!.archivedAt).toBeNull();
  });

  it('運営としてログインしていないと一覧を取れない', async () => {
    cookieJar.clear();
    await expect(listEventSummaries()).rejects.toThrow();
  });

  it('追加したイベントが一覧に出て、消せる', async () => {
    const created = await createEvent(NEW_EVENT);
    expect((await listEventSummaries()).some((r) => r.id === created.id)).toBe(true);

    await deleteEvent(created.id);
    expect((await listEventSummaries()).some((r) => r.id === created.id)).toBe(false);
  });

  it('参加者がいても、投票が無ければ消せる（参加者も一緒に消える）', async () => {
    const created = await createEvent({ ...NEW_EVENT, code: 'TESTE2' });
    await registerParticipant(created.id, { displayName: '仮の人', loginId: '1' });

    const result = await deleteEvent(created.id);

    expect(result.deletedParticipants).toBe(1);
    expect(await getRepo().getEvent(created.id)).toBeNull();
    expect(await getRepo().listParticipants(created.id)).toHaveLength(0);
  });

  it('投票が入ったイベントは消せない（記録を守る）', async () => {
    await changePhase(DEMO_EVENT_ID, 'ACTIVE');
    await changePhase(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED');
    await changePhase(DEMO_EVENT_ID, 'VOTING');

    cookieJar.clear();
    await setParticipantSession(DEMO_AGENT_PARTICIPANT_ID, DEMO_EVENT_ID);
    await castVotes([DEMO_SPY_PARTICIPANT_ID]);

    cookieJar.clear();
    await loginAsAdmin();
    const votesBefore = await getRepo().countVotes(DEMO_EVENT_ID);
    expect(votesBefore).toBeGreaterThan(0);

    await expect(deleteEvent(DEMO_EVENT_ID)).rejects.toMatchObject({ code: 'EVENT_HAS_VOTES' });

    // 断られたあとも、イベントと投票はそのまま残っている
    expect(await getRepo().getEvent(DEMO_EVENT_ID)).not.toBeNull();
    expect(await getRepo().countVotes(DEMO_EVENT_ID)).toBe(votesBefore);
  });

  it('しまっても中身は消えない。戻せる', async () => {
    const before = await getRepo().listParticipants(DEMO_EVENT_ID);

    const archived = await setEventArchived(DEMO_EVENT_ID, true);
    expect(archived.archivedAt).not.toBeNull();
    expect(await getRepo().listParticipants(DEMO_EVENT_ID)).toHaveLength(before.length);

    const restored = await setEventArchived(DEMO_EVENT_ID, false);
    expect(restored.archivedAt).toBeNull();
  });

  it('運営としてログインしていないと、消すこともしまうこともできない', async () => {
    const created = await createEvent({ ...NEW_EVENT, code: 'TESTE3' });
    cookieJar.clear();

    await expect(deleteEvent(created.id)).rejects.toThrow();
    await expect(setEventArchived(created.id, true)).rejects.toThrow();
  });
});
