import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { cachedMissionProgress } from './progress-cache';
import { computeFinalRanking, type FinalRankingRow } from '@/lib/core/final-score';
import type {
  GamePhase,
  GameResult,
  Mission,
  MissionKind,
  NotificationKind,
  Participant,
  ParticipantRole,
  PhaseHistoryEntry,
  RankingRow,
  SpyEvent,
  SpyNotification,
} from '@/lib/types';
import {
  canRegister,
  isIdentityRevealed,
  isValidPhaseTransition,
  PHASE_META,
} from '@/lib/core/phase';
import { GENERAL_MISSION_PRESETS, SPY_MISSION_PRESETS } from '@/lib/core/mission-presets';
import {
  generateLoginId,
  generatePassword,
  isValidLoginId,
  normalizeLoginId,
} from '@/lib/core/credentials';
import { selectSpies } from '@/lib/core/spy';
import { computeResults } from '@/lib/core/vote';
import { overallPercent } from '@/lib/core/score';
import { appMode, appUrl, demoAdminCredentials, supabaseConfig } from '@/lib/env';
import { getRepo } from '@/server/repo';
import { buildRanking } from '@/server/service/ranking';
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

export interface EventSummary extends SpyEvent {
  /** 当日いる人（欠席を除いた人数） */
  participantCount: number;
  /** 投票が入っているか。入っていると消せない（記録を守るため） */
  voteCount: number;
}

/**
 * 運営のイベント管理画面に出す一覧。
 *
 * 過去のイベントも含めて全部返し、しまってあるものは archivedAt で分かるようにする。
 * イベントの数は多くても数十なので、1件ずつ数えても重くならない
 * （人数は行を運ばない数え上げを使う）。
 */
export async function listEventSummaries(): Promise<EventSummary[]> {
  await requireAdmin();
  const repo = getRepo();
  const events = await repo.listEvents();
  return Promise.all(
    events.map(async (event) => {
      const [participantCount, voteCount] = await Promise.all([
        repo.countParticipants(event.id),
        repo.countVotes(event.id),
      ]);
      return { ...event, participantCount, voteCount };
    }),
  );
}

/**
 * イベントをしまう／戻す。
 *
 * 終わったイベントが選択欄に並び続けると、当日に選び間違える。
 * 消すのではなくしまうだけなので、達成率も投票の記録も残る。
 */
export async function setEventArchived(eventId: string, archived: boolean): Promise<SpyEvent> {
  await requireEventAccess(eventId);
  return getRepo().setEventArchived(eventId, archived);
}

/**
 * イベントを完全に消す。
 *
 * 投票が1件でも入っていたら消さない。
 * votes には削除禁止のトリガがあるため、消そうとすると
 * 参加者だけ消えてイベントが残る「半分だけ消えた」状態になりうる。
 * その場合はアーカイブを使ってもらう。
 *
 * 参加者がいるイベントは、コードの入力による確認を画面側で必須にしている。
 */
export async function deleteEvent(eventId: string): Promise<{ deletedParticipants: number }> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const [participantCount, voteCount] = await Promise.all([
    repo.countParticipants(eventId),
    repo.countVotes(eventId),
  ]);
  if (voteCount > 0) {
    throw new ServiceError(
      'EVENT_HAS_VOTES',
      '投票が入っているイベントは削除できません。記録を残すため「しまう」を使ってください。',
      409,
    );
  }
  await repo.deleteEvent(eventId);
  return { deletedParticipants: participantCount };
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
  /**
   * 受付で伝えるための数字4桁。運営画面だけに出す。
   * 古い参加者など、発行済みの値が残っていない場合は null。
   */
  issuedPassword: string | null;
  /** 当日その人が来ているか。false は運営が欠席にした人 */
  attending: boolean;
  joinedAt: string;
  /** この参加者専用の参加用URL。運営が本人に渡す */
  joinUrl: string;
}

export async function listAdminParticipants(eventId: string): Promise<AdminParticipantRow[]> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const [participants, progress, votes, issuedPasswords] = await Promise.all([
    // 出欠・役割・パスワードは押した直後に反映されてほしいので、毎回そのまま読む。
    // 達成数だけは数秒古くても困らないため、共有のキャッシュを通す
    repo.listParticipants(eventId),
    cachedMissionProgress(eventId),
    repo.listVotes(eventId),
    // 運営権限は requireEventAccess で確認済み。参加者向けには決して返さない
    repo.listIssuedPasswords(eventId),
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
      issuedPassword: issuedPasswords[p.id] ?? null,
      attending: p.attending,
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
  /** 受付で本人に伝える数字4桁 */
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
        '番号またはIDは24文字以内の半角英数字（-と_も可）で入力してください。',
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
    // 当日「パスワードを忘れた」に運営が答えられるよう、発行した数字4桁を残す。
    // ログインの照合に使うのはあくまでハッシュのほう。
    issuedPassword: password,
  });
  await repo.assignGeneralMissions(participant.id);

  return {
    participant,
    joinUrl: buildJoinUrl(participant.id, eventId),
    credentials: { loginId, password },
  };
}

export interface ParticipantQrCode {
  participantId: string;
  displayName: string;
  loginId: string | null;
  /** この人専用の入口。読み取るとその人としてログインする */
  joinUrl: string;
  /** QR画像（PNGのdata URL）。画面にそのまま貼れる */
  dataUrl: string;
}

/**
 * 参加者1人ぶんのQRコードを作る。
 *
 * 当日カードをなくした人に、運営の画面を見せてその場で読んでもらうため。
 * 中身は配ったカードのQRと同じURLなので、カードが後から出てきても両方使える。
 *
 * このQRは読んだ人をその人としてログインさせる。
 * 他人に見せると、その人になりすまされる。画面に出すのは本人確認のあとにすること。
 */
export async function getParticipantQrCode(
  eventId: string,
  participantId: string,
): Promise<ParticipantQrCode> {
  await requireEventAccess(eventId);
  const participant = await getRepo().getParticipant(participantId);
  // 別イベントの参加者IDを渡して他会場の人のQRを取れないようにする
  if (!participant || participant.eventId !== eventId) {
    throw new ServiceError('PARTICIPANT_NOT_FOUND', '参加者が見つかりません。', 404);
  }

  const joinUrl = buildJoinUrl(participant.id, participant.eventId);
  const dataUrl = await QRCode.toDataURL(joinUrl, {
    width: 512,
    margin: 2,
    // 会場の照明や画面の映り込みでも読めるよう、誤り訂正を高めにする
    errorCorrectionLevel: 'M',
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });

  return {
    participantId: participant.id,
    displayName: participant.displayName,
    loginId: participant.loginId,
    joinUrl,
    dataUrl,
  };
}

/**
 * パスワードを再発行する。
 * 参加者がパスワードを忘れた／紙をなくした場合に、運営がその場で作り直せるようにする。
 * 照合用のハッシュに加えて、運営画面に出すための数字4桁も更新する。
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
    issuedPassword: password,
  });

  // 間違いが続いてログインを止められている人も、ここで解除する。
  // 受付に来た人をその場で入れられるようにするため。
  await repo.setParticipantLoginAttempts(participantId, {
    failedLoginCount: 0,
    loginLockedUntil: null,
  });

  return { loginId, password };
}

/**
 * 当日の出欠を切り替える。ドタキャンした人を運営が外すための操作。
 *
 * 行ごと消さずに印を付けるだけにしているのは、押し間違えても戻せるようにするため。
 * 欠席にすると、ログイン・SPY抽選・投票・集計のすべてから外れる
 * （判定は各サービスとデータベースのトリガ側でも行う）。
 */
export async function setParticipantAttendance(
  eventId: string,
  participantId: string,
  attending: boolean,
): Promise<Participant> {
  await requireEventAccess(eventId);
  const repo = getRepo();
  const participant = await repo.getParticipant(participantId);
  // 別イベントの参加者IDを渡して他会場の人を欠席にできないようにする
  if (!participant || participant.eventId !== eventId) {
    throw new ServiceError('PARTICIPANT_NOT_FOUND', '参加者が見つかりません。', 404);
  }
  if (participant.attending === attending) return participant;
  return repo.setParticipantAttendance(participantId, attending);
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
  // 1人ずつ配ると人数分の往復になり、100人規模で実行時間の上限を超える
  return getRepo().distributeGeneralMissions(eventId);
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
  /** 1人でも選んだ人の数（票数ではなく人数） */
  votedCount: number;
  /** 投じられた票の総数 */
  ballotCount: number;
  identityRevealed: boolean;
  ballots: { voter: string; target: string; targetIsSpy: boolean }[];
  /** クエスト達成率とSPY正解を合わせた総合順位（表彰で読み上げる用） */
  finalRanking: FinalRankingRow[];
}

export async function getAdminResult(eventId: string): Promise<AdminResult> {
  const { event } = await requireEventAccess(eventId);
  const repo = getRepo();
  const [participants, votes, ranking] = await Promise.all([
    repo.listParticipants(eventId),
    repo.listVotes(eventId),
    buildRanking(eventId, event.phase),
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
    // 1人が複数選べるので、人数と票数は別物になる
    votedCount: voterIds.size,
    ballotCount: votes.length,
    identityRevealed: event.phase === 'IDENTITY_REVEALED' || event.phase === 'FINISHED',
    ballots: votes.map((v) => ({
      voter: nameById.get(v.voterParticipantId) ?? '(不明)',
      target: nameById.get(v.targetParticipantId) ?? '(不明)',
      targetIsSpy: spyIds.has(v.targetParticipantId),
    })),
    finalRanking: computeFinalRanking(ranking, participants, votes),
  };
}

export interface AdminRanking {
  rows: RankingRow[];
  /** 全体の達成率（達成した件数 ÷ 配った件数） */
  overall: number;
  /** SPY MISSION が達成率に入っているか（正体公開後のみ true） */
  includesSpyMissions: boolean;
}

/**
 * 運営向けの達成率ランキング。
 *
 * 参加者向けと同じ計算を使う。表彰で同率を分けたいときのために
 * 各行に最終達成時刻が入っている。
 */
export async function getAdminRanking(eventId: string): Promise<AdminRanking> {
  const { event } = await requireEventAccess(eventId);
  const rows = await buildRanking(event.id, event.phase);
  return {
    rows,
    overall: overallPercent(rows),
    includesSpyMissions: isIdentityRevealed(event.phase),
  };
}

/* ---------------------------- dashboard ----------------------------- */

export interface AdminDashboard {
  event: SpyEvent;
  participantCount: number;
  /** 欠席にした人数（当日のドタキャン） */
  absentCount: number;
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
    cachedMissionProgress(eventId),
    repo.listVotes(eventId),
    repo.listNotifications(eventId),
  ]);

  const present = participants.filter((p) => p.attending);

  return {
    event,
    // 人数は「当日いる人」を出す。欠席込みの数だと受付の実数と合わない
    participantCount: present.length,
    absentCount: participants.length - present.length,
    spyCount: present.filter((p) => p.role === 'SPY').length,
    completedMissions: progress.reduce((sum, p) => sum + p.completed, 0),
    totalMissions: progress.reduce((sum, p) => sum + p.total, 0),
    votedCount: votes.length,
    latestNotification: notifications[0] ?? null,
    joinUrl,
  };
}
