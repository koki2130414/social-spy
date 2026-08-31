import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import {
  ADMIN_COOKIE,
  PARTICIPANT_COOKIE,
  clearAdminSession,
  setAdminSession,
  setParticipantSession,
  verifyJoinToken,
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
  loginParticipant,
  setMissionCompleted,
} from './participant';
import {
  adminLogin,
  changePhase,
  createEvent,
  getAdminResult,
  getEvent,
  listAdminParticipants,
  registerParticipant,
  requireAdmin,
  resetParticipantPassword,
} from './admin';
import { canRevokeMember, inviteAdminMember, listAdminMembers, revokeAdminMember } from './members';
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
async function advanceTo(
  phase: 'ACTIVE' | 'SPY_MISSION_REVEALED' | 'VOTING' | 'IDENTITY_REVEALED',
) {
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
    await expect(setMissionCompleted(state.missions[0].assignmentId, true)).rejects.toMatchObject({
      code: 'PHASE_LOCKED',
    });

    await advanceTo('VOTING');
    await asAgent();
    await expect(setMissionCompleted(state.missions[0].assignmentId, true)).rejects.toMatchObject({
      code: 'PHASE_LOCKED',
    });
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

describe('運営による参加者の代理登録', () => {
  it('登録するとMISSIONが3件配られ、参加用リンクが発行される', async () => {
    await loginAdmin();
    const { participant, joinUrl } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '事前登録 花子',
      affiliation: '受付代行',
    });

    expect(participant.displayName).toBe('事前登録 花子');
    expect(participant.role).toBe('AGENT');
    const missions = await getRepo().listAssignedMissions(participant.id, 'GENERAL');
    expect(missions).toHaveLength(3);

    // 参加用リンクは /j/<署名付きトークン> の形
    expect(joinUrl).toContain('/j/');
    const token = joinUrl.split('/j/')[1];
    expect(verifyJoinToken(token)).toMatchObject({
      pid: participant.id,
      eid: DEMO_EVENT_ID,
    });
  });

  it('参加用リンクは改ざんすると無効になる', async () => {
    await loginAdmin();
    const { joinUrl } = await registerParticipant(DEMO_EVENT_ID, { displayName: '改ざん検証' });
    const token = joinUrl.split('/j/')[1];

    // 署名部分を1文字変える
    const [payload, signature] = token.split('.');
    const broken = `${payload}.${signature.slice(0, -1)}${signature.at(-1) === 'A' ? 'B' : 'A'}`;
    expect(verifyJoinToken(broken)).toBeNull();

    // 中身（参加者ID）を差し替えても、署名が合わないので通らない
    const forged = Buffer.from(
      JSON.stringify({ typ: 'join', pid: DEMO_SPY_PARTICIPANT_ID, eid: DEMO_EVENT_ID }),
    ).toString('base64url');
    expect(verifyJoinToken(`${forged}.${signature}`)).toBeNull();
  });

  it('参加者セッションのCookieとして参加用リンクのトークンは使えない', async () => {
    await loginAdmin();
    const { joinUrl } = await registerParticipant(DEMO_EVENT_ID, { displayName: '種別検証' });
    const token = joinUrl.split('/j/')[1];

    cookieJar.clear();
    cookieJar.raw.set(PARTICIPANT_COOKIE, token);
    await expect(getGameState()).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('同じ表示名は登録できない', async () => {
    await loginAdmin();
    await expect(
      registerParticipant(DEMO_EVENT_ID, { displayName: '佐藤 悠真' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
  });

  it('管理者でなければ代理登録できない', async () => {
    await expect(
      registerParticipant(DEMO_EVENT_ID, { displayName: '権限なし' }),
    ).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('投票フェーズ以降は追加できない', async () => {
    await advanceTo('VOTING');
    await loginAdmin();
    await expect(
      registerParticipant(DEMO_EVENT_ID, { displayName: '遅刻者' }),
    ).rejects.toMatchObject({ code: 'PHASE_NOT_ACCEPTING' });
  });
});

describe('運営が発行するIDとパスワード', () => {
  it('登録するとIDとパスワードが発行され、そのIDでログインできる', async () => {
    await loginAdmin();
    const { participant, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: 'ログイン検証',
    });

    expect(credentials.loginId).toMatch(/^[a-z0-9_-]{4,24}$/);
    expect(credentials.password.length).toBeGreaterThanOrEqual(6);

    cookieJar.clear();
    const result = await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });
    expect(result.participantId).toBe(participant.id);

    // ログイン後は自分の画面が開ける
    const state = await getGameState();
    expect(state.me.displayName).toBe('ログイン検証');
  });

  it('IDは大文字で入力しても通る', async () => {
    await loginAdmin();
    const { credentials } = await registerParticipant(DEMO_EVENT_ID, { displayName: '大文字検証' });

    cookieJar.clear();
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: credentials.loginId.toUpperCase(),
        password: credentials.password,
      }),
    ).resolves.toMatchObject({ eventId: DEMO_EVENT_ID });
  });

  it('パスワードが違えばログインできない', async () => {
    await loginAdmin();
    const { credentials } = await registerParticipant(DEMO_EVENT_ID, { displayName: '誤入力検証' });

    cookieJar.clear();
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: credentials.loginId,
        password: `${credentials.password}x`,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(getGameState()).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('存在しないIDでも、パスワード誤りと同じ応答にする', async () => {
    cookieJar.clear();
    const missing = await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: 'agent-zzzz',
      password: 'whatever-1',
    }).catch((e) => e as ServiceError);
    expect(missing).toBeInstanceOf(ServiceError);
    expect((missing as ServiceError).code).toBe('INVALID_CREDENTIALS');
    expect((missing as ServiceError).message).toBe('IDまたはパスワードが違います。');
  });

  it('平文パスワードはデータベースに残らない', async () => {
    await loginAdmin();
    const { participant, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: 'ハッシュ検証',
    });

    const stored = await getRepo().getParticipantPasswordHash(participant.id);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(credentials.password);
    expect(stored).toMatch(/^scrypt\$/);
  });

  it('参加者一覧APIにパスワードハッシュは含まれない', async () => {
    await loginAdmin();
    await registerParticipant(DEMO_EVENT_ID, { displayName: '漏洩検証' });

    const rows = await listAdminParticipants(DEMO_EVENT_ID);
    const target = rows.find((r) => r.displayName === '漏洩検証');
    expect(target?.loginId).toBeTruthy();
    expect(JSON.stringify(rows)).not.toContain('scrypt$');
  });

  it('同じIDは二重に発行できない', async () => {
    await loginAdmin();
    await registerParticipant(DEMO_EVENT_ID, { displayName: 'ID指定A', loginId: 'sato-yuma' });
    await expect(
      registerParticipant(DEMO_EVENT_ID, { displayName: 'ID指定B', loginId: 'SATO-YUMA' }),
    ).rejects.toMatchObject({ code: 'LOGIN_ID_TAKEN' });
  });

  it('パスワードを再発行すると古いパスワードでは入れない', async () => {
    await loginAdmin();
    const { participant, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '再発行検証',
    });

    await loginAdmin();
    const reissued = await resetParticipantPassword(DEMO_EVENT_ID, participant.id);
    expect(reissued.loginId).toBe(credentials.loginId);
    expect(reissued.password).not.toBe(credentials.password);

    cookieJar.clear();
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: credentials.loginId,
        password: credentials.password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: reissued.loginId,
        password: reissued.password,
      }),
    ).resolves.toMatchObject({ eventId: DEMO_EVENT_ID });
  });

  it('管理者でなければパスワードを再発行できない', async () => {
    await loginAdmin();
    const { participant } = await registerParticipant(DEMO_EVENT_ID, { displayName: '権限検証' });

    cookieJar.clear();
    await expect(resetParticipantPassword(DEMO_EVENT_ID, participant.id)).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });
});

describe('運営メンバーの管理', () => {
  it('管理者以外は運営メンバー一覧を見られない', async () => {
    cookieJar.clear();
    await expect(listAdminMembers()).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('管理者以外は招待できない', async () => {
    cookieJar.clear();
    await expect(inviteAdminMember('staff@example.com')).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });

  it('管理者以外は権限を外せない', async () => {
    cookieJar.clear();
    await expect(revokeAdminMember('someone')).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });

  it('デモモードでは招待できない（本番用の認証と混ざらないようにする）', async () => {
    await loginAdmin();
    await expect(inviteAdminMember('staff@example.com')).rejects.toMatchObject({
      code: 'DEMO_UNSUPPORTED',
    });
  });

  it('自分自身の運営権限は外せない', () => {
    // 全員が締め出される事故を防ぐための不変条件
    expect(canRevokeMember('user-a', 'user-a')).toBe(false);
    expect(canRevokeMember('user-a', 'user-b')).toBe(true);
  });

  it('デモモードでも一覧は自分だけ返り、権限判定は本番と同じ経路を通る', async () => {
    await loginAdmin();
    const members = await listAdminMembers();
    expect(members).toHaveLength(1);
    expect(members[0].isSelf).toBe(true);
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
