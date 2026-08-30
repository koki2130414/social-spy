import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import {
  ADMIN_COOKIE,
  clearAdminSession,
  setAdminSession,
  setParticipantSession,
} from '@/server/auth/session';
import {
  DEMO_AGENT_PARTICIPANT_ID,
  DEMO_EVENT_CODE,
  DEMO_EVENT_ID,
  DEMO_SPY_PARTICIPANT_ID,
} from '@/server/demo/seed';
import {
  castVote,
  getGameState,
  getResultForParticipant,
  joinEvent,
  listVoteCandidates,
  setMissionCompleted,
} from './participant';
import {
  adminLogin,
  changePhase,
  createEvent,
  getAdminResult,
  getEvent,
  listAdminParticipants,
  requireAdmin,
} from './admin';
import { ServiceError } from '@/server/errors';
import { demoAdminCredentials } from '@/lib/env';

const creds = demoAdminCredentials();

async function loginAdmin() {
  await adminLogin(creds.email, creds.password);
}

async function asAgent() {
  await setParticipantSession(DEMO_AGENT_PARTICIPANT_ID, DEMO_EVENT_ID);
}

async function asSpy() {
  await setParticipantSession(DEMO_SPY_PARTICIPANT_ID, DEMO_EVENT_ID);
}

/** 管理者としてフェーズを目的の段階まで進める */
async function advanceTo(phase: 'ACTIVE' | 'SPY_MISSION_REVEALED' | 'VOTING' | 'IDENTITY_REVEALED') {
  const order = ['ACTIVE', 'SPY_MISSION_REVEALED', 'VOTING', 'IDENTITY_REVEALED'] as const;
  await loginAdmin();
  for (const p of order) {
    await changePhase(DEMO_EVENT_ID, p);
    if (p === phase) break;
  }
}

beforeEach(async () => {
  resetDemoState();
  cookieJar.clear();
});

describe('参加登録とMISSION配布', () => {
  it('参加するとMISSIONが3件配布される', async () => {
    const { participantId } = await joinEvent({
      code: DEMO_EVENT_CODE,
      displayName: 'テスト参加者',
      affiliation: 'テスト所属',
    });

    const missions = await getRepo().listAssignedMissions(participantId, 'GENERAL');
    expect(missions).toHaveLength(3);
    expect(new Set(missions.map((m) => m.missionId)).size).toBe(3);

    const state = await getGameState();
    expect(state.missions).toHaveLength(3);
    expect(state.totalCount).toBe(3);
    expect(state.me.role).toBe('AGENT');
  });

  it('同じ表示名では重複参加できない', async () => {
    await joinEvent({ code: DEMO_EVENT_CODE, displayName: '重複テスト' });
    cookieJar.clear();
    await expect(
      joinEvent({ code: DEMO_EVENT_CODE, displayName: '重複テスト' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
  });

  it('存在しないイベントコードは弾かれる', async () => {
    await expect(joinEvent({ code: 'NOPE99', displayName: 'x' })).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
  });
});

describe('MISSIONの達成', () => {
  it('ACTIVE中はMISSIONを達成済みに変更できる', async () => {
    await advanceTo('ACTIVE');
    await asAgent();

    const before = await getGameState();
    const target = before.missions[0];
    expect(target.completed).toBe(false);

    const updated = await setMissionCompleted(target.assignmentId, true);
    expect(updated.completed).toBe(true);

    const after = await getGameState();
    expect(after.completedCount).toBe(1);

    // 取り消しもできる
    await setMissionCompleted(target.assignmentId, false);
    expect((await getGameState()).completedCount).toBe(0);
  });

  it('LOBBY中や投票フェーズではMISSIONを更新できない', async () => {
    await asAgent();
    const state = await getGameState();
    await expect(
      setMissionCompleted(state.missions[0].assignmentId, true),
    ).rejects.toMatchObject({ code: 'PHASE_LOCKED' });

    await advanceTo('VOTING');
    await asAgent();
    await expect(
      setMissionCompleted(state.missions[0].assignmentId, true),
    ).rejects.toMatchObject({ code: 'PHASE_LOCKED' });
  });
});

describe('SPY情報の秘匿', () => {
  it('一般参加者は公開前にSPY情報を取得できない', async () => {
    await advanceTo('ACTIVE');
    await asAgent();

    const state = await getGameState();
    expect(state.me.isSpy).toBe(false);
    expect(state.spyMissions).toBeNull();
    expect(state.spyMissionsPublic).toBe(false);
  });

  it('参加者向けのレスポンスに他人の役割が含まれない', async () => {
    await advanceTo('VOTING');
    await asAgent();

    const candidates = await listVoteCandidates();
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(Object.keys(c)).not.toContain('role');
    }
    expect(JSON.stringify(candidates)).not.toContain('SPY');

    const state = await getGameState();
    // 自分の役割以外に role という語が現れないこと
    expect(JSON.stringify(state.notifications)).not.toContain('"role"');
  });

  it('SPY本人だけが公開前に自分のSPY MISSIONを見られる', async () => {
    await advanceTo('ACTIVE');
    await asSpy();

    const state = await getGameState();
    expect(state.me.isSpy).toBe(true);
    expect(state.spyMissions).not.toBeNull();
    expect(state.spyMissions!.length).toBeGreaterThan(0);
  });

  it('公開後は一般参加者にもSPY MISSIONの内容が表示される', async () => {
    await advanceTo('SPY_MISSION_REVEALED');
    await asAgent();

    const state = await getGameState();
    expect(state.spyMissionsPublic).toBe(true);
    expect(state.spyMissions?.map((m) => m.code)).toContain('INFORMATION GATHERING');
    // SPYが誰かは分からない
    expect(JSON.stringify(state.spyMissions)).not.toContain('鈴木 玲奈');
  });
});

describe('FINAL VOTE', () => {
  it('自分自身へは投票できない', async () => {
    await advanceTo('VOTING');
    await asAgent();
    await expect(castVote(DEMO_AGENT_PARTICIPANT_ID)).rejects.toMatchObject({
      code: 'SELF_VOTE_FORBIDDEN',
    });
  });

  it('二重投票できず、投票後に変更もできない', async () => {
    await advanceTo('VOTING');
    await asAgent();

    await castVote(DEMO_SPY_PARTICIPANT_ID);
    const state = await getGameState();
    expect(state.vote?.targetParticipantId).toBe(DEMO_SPY_PARTICIPANT_ID);

    // 同じ相手への再投票
    await expect(castVote(DEMO_SPY_PARTICIPANT_ID)).rejects.toMatchObject({
      code: 'ALREADY_VOTED',
    });
    // 別の相手への投票（＝変更）
    const others = await listVoteCandidates();
    const another = others.find((c) => c.id !== DEMO_SPY_PARTICIPANT_ID)!;
    await expect(castVote(another.id)).rejects.toMatchObject({ code: 'ALREADY_VOTED' });

    // 投票内容は変わっていない
    const after = await getGameState();
    expect(after.vote?.targetParticipantId).toBe(DEMO_SPY_PARTICIPANT_ID);
  });

  it('投票フェーズ外では投票できない', async () => {
    await advanceTo('ACTIVE');
    await asAgent();
    await expect(castVote(DEMO_SPY_PARTICIPANT_ID)).rejects.toMatchObject({
      code: 'PHASE_NOT_VOTING',
    });
  });

  it('未認証では投票できない', async () => {
    await advanceTo('VOTING');
    cookieJar.clear();
    await expect(castVote(DEMO_SPY_PARTICIPANT_ID)).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });
});

describe('イベントの新規作成', () => {
  const newEvent = {
    name: 'AFTER PARTY vol.1',
    code: 'NIGHT9',
    startsAt: '2026-10-01T10:00:00.000Z',
    durationMinutes: 60,
    spyRevealOffsetMinutes: 30,
    spyCount: 1,
    registrationOpen: true,
  };

  it('作成したイベントを、作った本人がそのまま操作できる', async () => {
    await loginAdmin();
    const created = await createEvent(newEvent);

    // 権限チェックを通る＝event_admins に登録されている
    await expect(getEvent(created.id)).resolves.toMatchObject({ id: created.id });
    await expect(changePhase(created.id, 'ACTIVE')).resolves.toMatchObject({ phase: 'ACTIVE' });
  });

  it('初期MISSIONが用意され、参加者に3件配布される', async () => {
    await loginAdmin();
    const created = await createEvent(newEvent);

    const missions = await getRepo().listMissions(created.id);
    expect(missions.filter((m) => m.kind === 'GENERAL')).toHaveLength(8);
    expect(missions.filter((m) => m.kind === 'SPY')).toHaveLength(3);

    // 実際に参加者を登録するとMISSIONが配られる
    const { participantId } = await joinEvent({ code: 'NIGHT9', displayName: '新規参加者' });
    const assigned = await getRepo().listAssignedMissions(participantId, 'GENERAL');
    expect(assigned).toHaveLength(3);
  });

  it('既存のイベントコードは使い回せない', async () => {
    await loginAdmin();
    await expect(createEvent({ ...newEvent, code: DEMO_EVENT_CODE })).rejects.toMatchObject({
      code: 'CODE_TAKEN',
    });
  });

  it('管理者でなければイベントを作成できない', async () => {
    await expect(createEvent(newEvent)).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });
});

describe('フェーズ変更の権限', () => {
  it('管理者以外はフェーズを変更できない', async () => {
    // セッションなし
    await expect(changePhase(DEMO_EVENT_ID, 'ACTIVE')).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });

    // 参加者セッションだけを持っている場合も不可
    await asAgent();
    expect(cookieJar.has(ADMIN_COOKIE)).toBe(false);
    await expect(changePhase(DEMO_EVENT_ID, 'ACTIVE')).rejects.toBeInstanceOf(ServiceError);

    // フェーズは LOBBY のままであること
    const event = await getRepo().getEvent(DEMO_EVENT_ID);
    expect(event?.phase).toBe('LOBBY');
  });

  it('デモ用セッションが残っていても、本番モードではログインし直しを促す', async () => {
    // Supabase接続前のデモ用Cookieが残っている状況を再現する
    await setAdminSession({
      uid: 'demo-admin',
      email: 'admin@socialspy.demo',
      name: 'DEMO CONTROL',
      demo: true,
    });
    expect(cookieJar.has(ADMIN_COOKIE)).toBe(true);

    // 本番（Supabase）モードとして扱わせる
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

    try {
      // 403で行き止まりにせず、401にしてログイン画面へ戻せるようにする
      await expect(requireAdmin()).rejects.toMatchObject({
        code: 'NOT_AUTHENTICATED',
        status: 401,
      });
      // 使えないCookieはその場で捨てる
      expect(cookieJar.has(ADMIN_COOKIE)).toBe(false);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it('不正な資格情報ではログインできない', async () => {
    await expect(adminLogin(creds.email, 'wrong-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('フェーズを飛ばして変更できない', async () => {
    await loginAdmin();
    await expect(changePhase(DEMO_EVENT_ID, 'VOTING')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('ログアウトすると管理操作ができなくなる', async () => {
    await loginAdmin();
    await changePhase(DEMO_EVENT_ID, 'ACTIVE');
    await clearAdminSession();
    await expect(changePhase(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED')).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });
});

describe('IDENTITY REVEAL', () => {
  it('複数SPYの正体を表示できる', async () => {
    await advanceTo('VOTING');
    await asAgent();
    await castVote(DEMO_SPY_PARTICIPANT_ID);

    await loginAdmin();
    await changePhase(DEMO_EVENT_ID, 'IDENTITY_REVEALED');

    await asAgent();
    const result = await getResultForParticipant();
    expect(result.spies).toHaveLength(2);
    expect(result.spies.map((s) => s.displayName)).toContain('鈴木 玲奈');
    expect(result.myVote?.targetParticipantId).toBe(DEMO_SPY_PARTICIPANT_ID);
    expect(result.myVoteCorrect).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('公開前は結果を取得できない', async () => {
    await advanceTo('VOTING');
    await asAgent();
    await expect(getResultForParticipant()).rejects.toMatchObject({ code: 'NOT_REVEALED' });
  });

  it('管理者は投票状況と未投票者を確認できる', async () => {
    await advanceTo('VOTING');
    await loginAdmin();

    const result = await getAdminResult(DEMO_EVENT_ID);
    expect(result.votedCount + result.notVoted.length).toBe(result.totalParticipants);

    const participants = await listAdminParticipants(DEMO_EVENT_ID);
    expect(participants.filter((p) => p.role === 'SPY')).toHaveLength(2);
  });
});
