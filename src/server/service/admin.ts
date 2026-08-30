import { createClient } from '@supabase/supabase-js';
import type {
  GamePhase,
  GameResult,
  Mission,
  MissionKind,
  NotificationKind,
  Participant,
  ParticipantRole,
  PhaseHistoryEntry,
  SpyEvent,
  SpyNotification,
} from '@/lib/types';
import { canRegister, isValidPhaseTransition, PHASE_META } from '@/lib/core/phase';
import { GENERAL_MISSION_PRESETS, SPY_MISSION_PRESETS } from '@/lib/core/mission-presets';
import {
  generateLoginId,
  generatePassword,
  isValidLoginId,
  normalizeLoginId,
} from '@/lib/core/credentials';
import { selectSpies } from '@/lib/core/spy';
import { computeResults } from '@/lib/core/vote';
import { appMode, appUrl, demoAdminCredentials, supabaseConfig } from '@/lib/env';
import { getRepo } from '@/server/repo';
import { ServiceError } from '@/server/errors';
import {
  clearAdminSession,
  createJoinToken,
  getAdminSession,
  setAdminSession,
  type AdminSession,
} from '@/server/auth/session';
import { hashPassword } from '@/server/auth/password';
import { DEMO_ADMIN_ID } from '@/server/demo/seed';
import { sendPushToEvent } from '@/server/push/send';
import type { EventInput, MissionInput } from '@/server/repo/types';

/** フェーズごとに、通知タップで開くべき画面 */
const PHASE_DEEP_LINK: Partial<Record<GamePhase, string>> = {
  ACTIVE: '/game/missions',
  SPY_MISSION_REVEALED: '/game/intel',
  VOTING: '/game/vote',
  IDENTITY_REVEALED: '/game/result',
  FINISHED: '/game/result',
};

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new ServiceError('NOT_AUTHENTICATED', '管理者としてログインしてください。', 401);
  }
  if (session.demo && appMode() !== 'demo') {
    // デモ用セッションで本番データにアクセスさせない。
    // Supabaseを接続する前のCookieが残っているだけなので、そのまま捨てて
    // ログインし直してもらう。401 を返すことで画面側がログインへ誘導する。
    await clearAdminSession();
    throw new ServiceError(
      'NOT_AUTHENTICATED',
      'デモ用のログイン情報が残っていました。もう一度ログインしてください。',
      401,
    );
  }
  return session;
}

export async function adminLogin(email: string, password: string): Promise<AdminSession> {
  if (appMode() === 'demo') {
    const creds = demoAdminCredentials();
    if (email.trim().toLowerCase() !== creds.email.toLowerCase() || password !== creds.password) {
      throw new ServiceError(
        'INVALID_CREDENTIALS',
        'メールアドレスまたはパスワードが違います。',
        401,
      );
    }
    const session = {
      uid: DEMO_ADMIN_ID,
      email: creds.email,
      name: 'DEMO CONTROL',
      demo: true,
    };
    await setAdminSession(session);
    return { ...session, iat: Date.now() };
  }

  // Supabase Authentication で認証し、users テーブルの管理者フラグを確認する
  const { url, anonKey } = supabaseConfig();
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new ServiceError(
      'INVALID_CREDENTIALS',
      'メールアドレスまたはパスワードが違います。',
      401,
    );
  }

  const { supabaseAdmin } = await import('@/server/supabase/clients');
  const { data: profile } = await supabaseAdmin()
    .from('users')
    .select('id, email, display_name, is_admin')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    throw new ServiceError('NOT_ADMIN', '管理者権限がありません。', 403);
  }

  const session = {
    uid: profile.id as string,
    email: (profile.email as string) ?? data.user.email ?? '',
    name: (profile.display_name as string) ?? 'ADMIN',
    demo: false,
  };
  await setAdminSession(session);
  return { ...session, iat: Date.now() };
}

async function requireEventAccess(
  eventId: string,
): Promise<{ session: AdminSession; event: SpyEvent }> {
  const session = await requireAdmin();
  const repo = getRepo();
  const event = await repo.getEvent(eventId);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);

  // デモ／本番で同じ権限判定を通す（モードによる分岐を作らない）
  const allowed = await repo.isEventAdmin(eventId, session.uid);
  if (!allowed) {
    throw new ServiceError('FORBIDDEN', 'このイベントを管理する権限がありません。', 403);
  }
  return { session, event };
}

/* ------------------------------ events ------------------------------ */

export async function listEvents(): Promise<SpyEvent[]> {
  await requireAdmin();
  return getRepo().listEvents();
}

export async function getEvent(eventId: string): Promise<SpyEvent> {
  const { event } = await requireEventAccess(eventId);
  return event;
}

/**
 * 新しいイベントに初期MISSION（一般8件 + SPY3件）を用意する。
 * MISSIONが1件も無いイベントは、参加者が登録しても何も配布されず成立しない。
 */
async function seedPresetMissions(eventId: string): Promise<number> {
  const repo = getRepo();
  const existing = await repo.listMissions(eventId);
  if (existing.length > 0) return 0;

  let created = 0;
  for (const preset of GENERAL_MISSION_PRESETS) {
    await repo.createMission({ eventId, ...preset, kind: 'GENERAL', active: true });
    created += 1;
  }
  for (const preset of SPY_MISSION_PRESETS) {
    await repo.createMission({ eventId, ...preset, kind: 'SPY', active: true });
    created += 1;
  }
  return created;
}

export async function createEvent(input: EventInput): Promise<SpyEvent> {
  const session = await requireAdmin();
  const repo = getRepo();
  const existing = await repo.getEventByCode(input.code);
  if (existing) {
    throw new ServiceError('CODE_TAKEN', 'このイベントコードはすでに使われています。', 409);
  }

  const event = await repo.createEvent(input);

  // 作成者をこのイベントの管理者として登録する。
  // これが無いと権限チェックに弾かれ、作った本人が操作できないイベントになる。
  await repo.addEventAdmin(event.id, session.uid);

  // すぐ使える状態にするため、初期MISSIONも一緒に用意する。
  // 文言はあとから /admin/missions で自由に編集・削除できる。
  await seedPresetMissions(event.id);

  return event;
}

export async function updateEvent(eventId: string, input: Partial<EventInput>): Promise<SpyEvent> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  if (input.code) {
    const existing = await repo.getEventByCode(input.code);
    if (existing && existing.id !== eventId) {
      throw new ServiceError('CODE_TAKEN', 'このイベントコードはすでに使われています。', 409);
    }
  }
  return repo.updateEvent(eventId, input);
}

/* ------------------------------ phase ------------------------------- */

const PHASE_NOTIFICATION: Partial<
  Record<GamePhase, { title: string; body: string; kind: NotificationKind }>
> = {
  ACTIVE: {
    title: 'OPERATION START',
    body: '作戦を開始する。各自のMISSIONを遂行せよ。',
    kind: 'PHASE',
  },
  SPY_MISSION_REVEALED: {
    title: 'SPY MISSION REVEALED',
    body: 'SPYに与えられていたMISSIONを公開する。これまでの会話や行動を思い出せ。',
    kind: 'CLASSIFIED',
  },
  VOTING: {
    title: 'OPERATION TERMINATED',
    body: '作戦を終了する。SPYと思われる人物へ投票せよ。',
    kind: 'ALERT',
  },
  IDENTITY_REVEALED: {
    title: 'IDENTITY REVEAL',
    body: 'SPYの正体を公開する。結果を確認せよ。',
    kind: 'ALERT',
  },
  FINISHED: {
    title: 'MISSION COMPLETE',
    body: '全作戦を終了する。諸君の働きに感謝する。',
    kind: 'INFO',
  },
};

export async function changePhase(eventId: string, to: GamePhase): Promise<SpyEvent> {
  const { session, event } = await requireEventAccess(eventId);
  if (!isValidPhaseTransition(event.phase, to)) {
    throw new ServiceError(
      'INVALID_TRANSITION',
      `${PHASE_META[event.phase].label} から ${PHASE_META[to].label} へは変更できません。`,
      400,
    );
  }
  const repo = getRepo();

  // ゲーム開始時にSPYが未設定なら自動選出する
  if (to === 'ACTIVE') {
    const participants = await repo.listParticipants(eventId);
    const spies = participants.filter((p) => p.role === 'SPY');
    if (spies.length === 0 && participants.length > 0 && event.spyCount > 0) {
      const { spyIds } = selectSpies(participants, event.spyCount);
      await repo.setParticipantRoles(eventId, spyIds);
    }
  }

  const updated = await repo.setPhase(eventId, to, session.uid);

  const notification = PHASE_NOTIFICATION[to];
  if (notification) {
    await repo.createNotification({ eventId, ...notification });
    await sendPushToEvent(eventId, {
      title: notification.title,
      body: notification.body,
      url: PHASE_DEEP_LINK[to] ?? '/game',
      tag: 'phase',
    });
  }
  return updated;
}

export async function listPhaseHistory(eventId: string): Promise<PhaseHistoryEntry[]> {
  await requireEventAccess(eventId);
  return getRepo().listPhaseHistory(eventId);
}

/* --------------------------- participants --------------------------- */

export interface AdminParticipantRow {
  id: string;
  displayName: string;
  affiliation: string | null;
  role: ParticipantRole;
  completed: number;
  total: number;
  hasVoted: boolean;
  votedFor: string | null;
  loginId: string | null;
  joinedAt: string;
  /** この参加者専用の参加用URL。運営が本人に渡す */
  joinUrl: string;
}

export async function listAdminParticipants(eventId: string): Promise<AdminParticipantRow[]> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const [participants, progress, votes] = await Promise.all([
    repo.listParticipants(eventId),
    repo.missionProgress(eventId),
    repo.listVotes(eventId),
  ]);
  const nameById = new Map(participants.map((p) => [p.id, p.displayName]));

  return participants.map((p) => {
    const pr = progress.find((x) => x.participantId === p.id);
    const vote = votes.find((v) => v.voterParticipantId === p.id);
    return {
      id: p.id,
      displayName: p.displayName,
      affiliation: p.affiliation,
      role: p.role,
      completed: pr?.completed ?? 0,
      total: pr?.total ?? 0,
      hasVoted: Boolean(vote),
      votedFor: vote ? (nameById.get(vote.targetParticipantId) ?? null) : null,
      loginId: p.loginId,
      joinedAt: p.joinedAt,
      joinUrl: buildJoinUrl(p.id, p.eventId),
    };
  });
}

/**
 * 運営が参加者を代理登録する。
 *
 * 参加者本人が /join を使う場合と同じく、登録と同時に一般MISSIONを3件配る。
 * 受付を締め切っていても運営は追加できる（当日の飛び込みや代理受付のため）が、
 * 投票以降のフェーズでは公平性が壊れるので追加できない。
 */
export interface IssuedCredentials {
  loginId: string;
  /** 平文はこの瞬間だけ返す。保存されるのはハッシュのみ */
  password: string;
}

/**
 * ログインIDを決める。
 * 運営が指定していればそれを使い、していなければ重複しないものを自動生成する。
 */
async function resolveLoginId(eventId: string, requested?: string | null): Promise<string> {
  const repo = getRepo();

  if (requested && requested.trim()) {
    const id = normalizeLoginId(requested);
    if (!isValidLoginId(id)) {
      throw new ServiceError(
        'INVALID_LOGIN_ID',
        'ログインIDは4〜24文字の半角英数字（-と_も可）で入力してください。',
        400,
      );
    }
    if (await repo.findParticipantByLoginId(eventId, id)) {
      throw new ServiceError(
        'LOGIN_ID_TAKEN',
        'このログインIDはすでに使われています。別のIDにしてください。',
        409,
      );
    }
    return id;
  }

  // 自動生成。まれな衝突に備えて数回引き直す
  for (let i = 0; i < 10; i += 1) {
    const id = generateLoginId();
    if (!(await repo.findParticipantByLoginId(eventId, id))) return id;
  }
  throw new ServiceError('LOGIN_ID_TAKEN', 'ログインIDを発行できませんでした。', 500);
}

export async function registerParticipant(
  eventId: string,
  input: { displayName: string; affiliation?: string | null; loginId?: string | null },
): Promise<{ participant: Participant; joinUrl: string; credentials: IssuedCredentials }> {
  const { event } = await requireEventAccess(eventId);
  if (!canRegister(event.phase)) {
    throw new ServiceError(
      'PHASE_NOT_ACCEPTING',
      'ゲームが進行しているため、これ以上参加者を追加できません。',
      403,
    );
  }

  const displayName = input.displayName.trim();
  const repo = getRepo();
  const duplicated = await repo.findParticipantByName(eventId, displayName);
  if (duplicated) {
    throw new ServiceError(
      'DUPLICATE_NAME',
      'その表示名はすでに登録されています。別の名前にしてください。',
      409,
    );
  }

  const loginId = await resolveLoginId(eventId, input.loginId);
  const password = generatePassword();

  const participant = await repo.createParticipant({
    eventId,
    displayName,
    affiliation: input.affiliation?.trim() || null,
    loginId,
    passwordHash: await hashPassword(password),
  });
  await repo.assignGeneralMissions(participant.id);

  return {
    participant,
    joinUrl: buildJoinUrl(participant.id, eventId),
    credentials: { loginId, password },
  };
}

/**
 * パスワードを再発行する。
 * 参加者がパスワードを忘れた／紙をなくした場合に、運営がその場で作り直せるようにする。
 * 平文は返り値としてこの一度だけ返し、保存はハッシュのみ。
 */
export async function resetParticipantPassword(
  eventId: string,
  participantId: string,
): Promise<IssuedCredentials> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const participant = await repo.getParticipant(participantId);
  if (!participant || participant.eventId !== eventId) {
    throw new ServiceError('PARTICIPANT_NOT_FOUND', '参加者が見つかりません。', 404);
  }

  // 参加用リンクだけで登録された人には、この機会にIDも発行する
  const loginId = participant.loginId ?? (await resolveLoginId(eventId, null));
  const password = generatePassword();
  await repo.setParticipantCredentials(participantId, {
    loginId,
    passwordHash: await hashPassword(password),
  });

  return { loginId, password };
}

/** 参加者ごとの参加用URL（この人専用の入口） */
export function buildJoinUrl(participantId: string, eventId: string): string {
  return `${appUrl()}/j/${createJoinToken(participantId, eventId)}`;
}

export async function autoAssignSpies(eventId: string, count?: number): Promise<Participant[]> {
  const { event } = await requireEventAccess(eventId);
  const repo = getRepo();
  const participants = await repo.listParticipants(eventId);
  if (participants.length === 0) {
    throw new ServiceError('NO_PARTICIPANTS', '参加者がいません。', 400);
  }
  const { spyIds } = selectSpies(participants, count ?? event.spyCount);
  return repo.setParticipantRoles(eventId, spyIds);
}

export async function setParticipantRole(
  eventId: string,
  participantId: string,
  role: ParticipantRole,
): Promise<Participant> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const participant = await repo.getParticipant(participantId);
  if (!participant || participant.eventId !== eventId) {
    throw new ServiceError('PARTICIPANT_NOT_FOUND', '参加者が見つかりません。', 404);
  }
  return repo.setParticipantRole(participantId, role);
}

/* ----------------------------- missions ----------------------------- */

export async function listMissions(eventId: string): Promise<Mission[]> {
  await requireEventAccess(eventId);
  return getRepo().listMissions(eventId);
}

export async function createMission(input: MissionInput): Promise<Mission> {
  if (!input.eventId) throw new ServiceError('EVENT_REQUIRED', 'イベントを指定してください。', 400);
  await requireEventAccess(input.eventId);
  return getRepo().createMission(input);
}

export async function updateMission(
  eventId: string,
  missionId: string,
  input: Partial<MissionInput>,
): Promise<Mission> {
  await requireEventAccess(eventId);
  return getRepo().updateMission(missionId, input);
}

export async function deleteMission(eventId: string, missionId: string): Promise<void> {
  await requireEventAccess(eventId);
  await getRepo().deleteMission(missionId);
}

/** 未配布の参加者へ一般MISSIONを3件ずつ配布する */
export async function distributeMissions(eventId: string): Promise<{ assigned: number }> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const participants = await repo.listParticipants(eventId);
  let assigned = 0;
  for (const p of participants) {
    const before = await repo.listAssignedMissions(p.id, 'GENERAL');
    if (before.length > 0) continue;
    await repo.assignGeneralMissions(p.id);
    assigned += 1;
  }
  return { assigned };
}

export function missionKindLabel(kind: MissionKind): string {
  return kind === 'SPY' ? 'SPY MISSION' : '一般MISSION';
}

/* --------------------------- notifications -------------------------- */

export async function listNotifications(eventId: string): Promise<SpyNotification[]> {
  await requireEventAccess(eventId);
  return getRepo().listNotifications(eventId);
}

export async function createNotification(input: {
  eventId: string;
  title: string;
  body: string;
  kind: NotificationKind;
}): Promise<SpyNotification> {
  await requireEventAccess(input.eventId);
  const notification = await getRepo().createNotification(input);
  await sendPushToEvent(input.eventId, {
    title: input.title,
    body: input.body,
    tag: 'notice',
  });
  return notification;
}

/* ------------------------------ results ----------------------------- */

export interface AdminResult extends GameResult {
  notVoted: { id: string; displayName: string }[];
  votedCount: number;
  identityRevealed: boolean;
  ballots: { voter: string; target: string; targetIsSpy: boolean }[];
}

export async function getAdminResult(eventId: string): Promise<AdminResult> {
  const { event } = await requireEventAccess(eventId);
  const repo = getRepo();
  const [participants, votes] = await Promise.all([
    repo.listParticipants(eventId),
    repo.listVotes(eventId),
  ]);
  const result = computeResults(participants, votes);
  const voterIds = new Set(votes.map((v) => v.voterParticipantId));
  const nameById = new Map(participants.map((p) => [p.id, p.displayName]));
  const spyIds = new Set(participants.filter((p) => p.role === 'SPY').map((p) => p.id));

  return {
    ...result,
    notVoted: participants
      .filter((p) => !voterIds.has(p.id))
      .map((p) => ({ id: p.id, displayName: p.displayName })),
    votedCount: votes.length,
    identityRevealed: event.phase === 'IDENTITY_REVEALED' || event.phase === 'FINISHED',
    ballots: votes.map((v) => ({
      voter: nameById.get(v.voterParticipantId) ?? '(不明)',
      target: nameById.get(v.targetParticipantId) ?? '(不明)',
      targetIsSpy: spyIds.has(v.targetParticipantId),
    })),
  };
}

/* ---------------------------- dashboard ----------------------------- */

export interface AdminDashboard {
  event: SpyEvent;
  participantCount: number;
  spyCount: number;
  completedMissions: number;
  totalMissions: number;
  votedCount: number;
  latestNotification: SpyNotification | null;
  joinUrl: string;
}

export async function getDashboard(eventId: string, joinUrl: string): Promise<AdminDashboard> {
  const { event } = await requireEventAccess(eventId);
  const repo = getRepo();
  const [participants, progress, votes, notifications] = await Promise.all([
    repo.listParticipants(eventId),
    repo.missionProgress(eventId),
    repo.listVotes(eventId),
    repo.listNotifications(eventId),
  ]);

  return {
    event,
    participantCount: participants.length,
    spyCount: participants.filter((p) => p.role === 'SPY').length,
    completedMissions: progress.reduce((sum, p) => sum + p.completed, 0),
    totalMissions: progress.reduce((sum, p) => sum + p.total, 0),
    votedCount: votes.length,
    latestNotification: notifications[0] ?? null,
    joinUrl,
  };
}
