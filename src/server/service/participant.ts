import type {
  AssignedMission,
  GameResult,
  Participant,
  ParticipantGameState,
  PublicParticipant,
  RankingRow,
  Vote,
} from '@/lib/types';
import {
  canRegister,
  canUpdateMissionProgress,
  isIdentityRevealed,
  isSpyMissionShared,
} from '@/lib/core/phase';
import { visibleSpyMissions } from '@/lib/core/intel';
import { computeFinalRanking, type FinalRankingRow } from '@/lib/core/final-score';

/** 役割の判定はここ1か所に寄せる（画面ごとに書き分けると取りこぼす） */
function isSpy(participant: { role: string }): boolean {
  return participant.role === 'SPY';
}
import { toPublicParticipant, toPublicParticipants } from '@/lib/core/spy';
import { computeResults, validateVote, VOTE_REJECTION_MESSAGE } from '@/lib/core/vote';
import { getRepo } from '@/server/repo';
import { buildRanking } from '@/server/service/ranking';
import { ServiceError } from '@/server/errors';
import {
  getParticipantSession,
  setParticipantSession,
  type ParticipantSession,
} from '@/server/auth/session';
import { verifyPassword } from '@/server/auth/password';
import {
  afterFailure,
  afterSuccess,
  isLocked,
  lockRemainingSeconds,
  lockedMessage,
} from '@/server/auth/login-throttle';
import { normalizeLoginId } from '@/lib/core/credentials';
import { normalizeEventCode } from '@/lib/utils';

async function requireSession(): Promise<ParticipantSession> {
  const session = await getParticipantSession();
  if (!session) {
    throw new ServiceError('NOT_AUTHENTICATED', '参加者セッションが見つかりません。', 401);
  }
  return session;
}

export interface JoinInput {
  code: string;
  displayName: string;
  affiliation?: string | null;
}

export async function joinEvent(
  input: JoinInput,
): Promise<{ eventId: string; participantId: string }> {
  const repo = getRepo();
  const event = await repo.getEventByCode(normalizeEventCode(input.code));
  if (!event) {
    throw new ServiceError('EVENT_NOT_FOUND', 'イベントコードが見つかりません。', 404);
  }
  if (!event.registrationOpen) {
    throw new ServiceError('REGISTRATION_CLOSED', 'このイベントの受付は終了しています。', 403);
  }
  if (!canRegister(event.phase)) {
    throw new ServiceError(
      'PHASE_NOT_ACCEPTING',
      'ゲームが進行中のため、現在は参加登録できません。',
      403,
    );
  }

  const displayName = input.displayName.trim();
  const duplicated = await repo.findParticipantByName(event.id, displayName);
  if (duplicated) {
    throw new ServiceError(
      'DUPLICATE_NAME',
      'その表示名はすでに使われています。別の名前を入力してください。',
      409,
    );
  }

  const participant = await repo.createParticipant({
    eventId: event.id,
    displayName,
    affiliation: input.affiliation?.trim() || null,
  });
  await repo.assignGeneralMissions(participant.id);
  await setParticipantSession(participant.id, event.id);

  return { eventId: event.id, participantId: participant.id };
}

export interface LoginInput {
  code: string;
  loginId: string;
  password: string;
}

/**
 * 運営が発行したIDとパスワードでログインする。
 *
 * IDが存在しない場合とパスワードが違う場合で応答を変えない。
 * 「そのIDは存在する」と分かること自体が、当日の総当たりの手がかりになるため。
 */
export async function loginParticipant(
  input: LoginInput,
): Promise<{ eventId: string; participantId: string }> {
  const repo = getRepo();
  const event = await repo.getEventByCode(normalizeEventCode(input.code));

  const failed = () =>
    new ServiceError('INVALID_CREDENTIALS', 'IDまたはパスワードが違います。', 401);
  const notAttending = () =>
    new ServiceError('NOT_ATTENDING', '欠席として登録されています。受付にお声がけください。', 403);

  if (!event) throw failed();

  const participant = await repo.findParticipantByLoginId(
    event.id,
    normalizeLoginId(input.loginId),
  );
  if (!participant) throw failed();

  const attempts = {
    failedCount: participant.failedLoginCount,
    lockedUntil: participant.loginLockedUntil,
  };

  // 止めている間はパスワードの照合そのものを行わない。
  // 照合は意図的に重い計算（scrypt）で1回に数秒かかるため、
  // ここで先に返さないと、総当たりされるだけでサーバーの計算枠を使い切り、
  // 当日アプリが止まってしまう。
  if (isLocked(attempts)) {
    throw new ServiceError('LOGIN_LOCKED', lockedMessage(lockRemainingSeconds(attempts)), 429);
  }

  const hash = await repo.getParticipantPasswordHash(participant.id);
  if (!hash || !(await verifyPassword(input.password, hash))) {
    const next = afterFailure(attempts);
    await repo.setParticipantLoginAttempts(participant.id, {
      failedLoginCount: next.failedCount,
      loginLockedUntil: next.lockedUntil,
    });
    // 止めたことはこの時点で伝える。何度打っても同じ文言だと
    // 参加者が原因に気づけず、受付に来るのが遅れる。
    if (isLocked(next)) {
      throw new ServiceError('LOGIN_LOCKED', lockedMessage(lockRemainingSeconds(next)), 429);
    }
    throw failed();
  }

  // IDとパスワードが合っていても、欠席にした人は入れない。
  // 「違います」ではなく理由を出す。受付が原因をすぐ判断できるようにするため。
  if (!participant.attending) throw notAttending();

  // 入れたので数えていた回数を消す
  if (attempts.failedCount !== 0 || attempts.lockedUntil !== null) {
    const cleared = afterSuccess();
    await repo.setParticipantLoginAttempts(participant.id, {
      failedLoginCount: cleared.failedCount,
      loginLockedUntil: cleared.lockedUntil,
    });
  }

  await setParticipantSession(participant.id, event.id);
  return { eventId: event.id, participantId: participant.id };
}

/** 参加者画面が必要とする状態。他人の役割は絶対に含めない */
export async function getGameState(): Promise<ParticipantGameState> {
  const session = await requireSession();
  const repo = getRepo();

  const [event, me] = await Promise.all([
    repo.getEvent(session.eid),
    repo.getParticipant(session.pid),
  ]);
  if (!event || !me || me.eventId !== event.id) {
    throw new ServiceError(
      'SESSION_INVALID',
      '参加情報が見つかりません。再度参加してください。',
      401,
    );
  }
  // 途中で欠席にされた場合、次の更新でゲーム画面から出す。
  // 401 にしているのは、画面が参加登録へ戻してくれるため
  // （そこで「欠席として登録されています」と理由が出る）。
  if (!me.attending) {
    throw new ServiceError('NOT_ATTENDING', '欠席として登録されています。', 401);
  }

  // この画面は101台が15秒おきに叩き、フェーズが変わった瞬間には全員が同時に叩く。
  // 1回ぶんの重さがそのまま101倍になるので、次の3点を守る。
  //  ・参加者の表を丸ごと取らない（人数は数え上げ、投票先は1件だけ引く）
  //  ・問い合わせは待ち合わせの回数を減らして、1回のまとまりで流す
  //  ・その場面で要らないものは引かない（SPY MISSIONの一覧は公開後だけ）
  // 「公開する」設定が切ってあれば、公開のフェーズでもSPY MISSIONは引かない。
  // 画面で隠すのではなく、そもそもサーバーから出さない
  const shared = isSpyMissionShared(event);
  const needsPublicSpyMissions = !isSpy(me) && shared;

  const [assigned, notifications, myVotes, participantCount, eventMissions] = await Promise.all([
    repo.listAssignedMissions(me.id),
    repo.listNotifications(event.id),
    repo.listVotesByVoter(event.id, me.id),
    repo.countParticipants(event.id),
    needsPublicSpyMissions ? repo.listMissions(event.id) : Promise.resolve([]),
  ]);

  const generalMissions = assigned.filter((m) => m.kind === 'GENERAL');
  const ownSpyMissions = assigned.filter((m) => m.kind === 'SPY');

  // 公開用のSPY MISSION一覧（内容のみ。誰の達成状況かは分からない）
  const publicSpyMissions: AssignedMission[] = eventMissions
    .filter((m) => m.kind === 'SPY' && m.active)
    .map((m, i) => ({
      assignmentId: `public-${m.id}`,
      missionId: m.id,
      orderIndex: i + 1,
      code: m.code,
      title: m.title,
      body: m.body,
      kind: 'SPY' as const,
      difficulty: m.difficulty,
      completed: false,
      completedAt: null,
    }));

  const spyMissions = visibleSpyMissions({
    shared,
    isSpy: isSpy(me),
    ownSpyMissions,
    publicSpyMissions,
  });

  const endsAt = event.activeStartedAt
    ? new Date(
        new Date(event.activeStartedAt).getTime() + event.durationMinutes * 60_000,
      ).toISOString()
    : null;

  return {
    event: {
      id: event.id,
      name: event.name,
      code: event.code,
      phase: event.phase,
      phaseChangedAt: event.phaseChangedAt,
      activeStartedAt: event.activeStartedAt,
      durationMinutes: event.durationMinutes,
      endsAt,
    },
    me: {
      id: me.id,
      displayName: me.displayName,
      affiliation: me.affiliation,
      role: me.role,
      isSpy: isSpy(me),
    },
    missions: generalMissions,
    completedCount: generalMissions.filter((m) => m.completed).length,
    totalCount: generalMissions.length,
    spyMissions,
    spyMissionsPublic: spyMissions !== null && !isSpy(me),
    // 画面に出るのは新しい3件だけ。全部を毎回送ると、
    // フェーズが進むほど1回の通信が重くなっていく
    notifications: notifications.slice(0, 5),
    // 名前はここで引かない。投票画面が持っている候補一覧から引ける。
    // 毎回の更新で最大10人ぶんの名前を引くと、その通信が101台ぶん走る
    votedTargetIds: myVotes.map((v) => v.targetParticipantId),
    participantCount,
  };
}

export async function setMissionCompleted(
  assignmentId: string,
  completed: boolean,
): Promise<AssignedMission> {
  const session = await requireSession();
  const repo = getRepo();
  const event = await repo.getEvent(session.eid);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);
  if (!canUpdateMissionProgress(event.phase)) {
    throw new ServiceError(
      'PHASE_LOCKED',
      '現在のフェーズではMISSIONの達成状況を変更できません。',
      403,
    );
  }
  const updated = await repo.setMissionCompleted(session.pid, assignmentId, completed);
  if (!updated) {
    throw new ServiceError('MISSION_NOT_FOUND', 'MISSIONが見つかりません。', 404);
  }
  return updated;
}

export interface ParticipantRanking {
  rows: RankingRow[];
  /** 自分の行。欠席にされた場合など、見つからないこともある */
  me: RankingRow | null;
  /** 参加者に見せる母数（欠席者を除いた人数） */
  totalParticipants: number;
  /**
   * SPY MISSION が達成率に入っているか。
   * 正体公開後だけ true になる。画面の説明文の出し分けに使う。
   */
  includesSpyMissions: boolean;
}

/**
 * クエストの達成率ランキング。
 *
 * 誰でも見られるが、返すのは表示名と達成率だけで role は含まない。
 * SPY MISSION を含めるかはフェーズだけで決まる（buildRanking 側で判定）。
 */
export async function getRanking(): Promise<ParticipantRanking> {
  const session = await requireSession();
  const repo = getRepo();
  const event = await repo.getEvent(session.eid);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);

  const rows = await buildRanking(event.id, event.phase);
  return {
    rows,
    me: rows.find((r) => r.participantId === session.pid) ?? null,
    totalParticipants: rows.length,
    includesSpyMissions: isIdentityRevealed(event.phase),
  };
}

/** 投票対象の一覧（自分以外・role を含まない） */
export async function listVoteCandidates(): Promise<PublicParticipant[]> {
  const session = await requireSession();
  const repo = getRepo();
  const participants = await repo.listParticipants(session.eid);
  // 欠席者は候補に出さない。いない人へ票が流れるのを防ぐ
  return toPublicParticipants(participants.filter((p) => p.id !== session.pid && p.attending));
}

/**
 * SPYだと思う人を選んで送る（最大10人）。
 *
 * 1人1票ではなく複数選べるので、次の3つをサーバー側で必ず確かめる。
 *  ・上限を超えていないこと（画面だけの制限にしない）
 *  ・同じ人を二重に選んでいないこと
 *  ・すでに送っていないこと（送信後の変更はできない）
 * データベース側にも同じ制約とトリガを置いてある。
 */
export async function castVotes(
  targetIds: readonly string[],
): Promise<{ targetDisplayNames: string[] }> {
  const session = await requireSession();
  const repo = getRepo();

  const event = await repo.getEvent(session.eid);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);

  // 同じ人を2回押しても1人ぶんとして扱う（画面の二度押し対策）
  const unique = [...new Set(targetIds)];

  const [existingVotes, me, ...targets] = await Promise.all([
    repo.listVotesByVoter(event.id, session.pid),
    repo.getParticipant(session.pid),
    ...unique.map((id) => repo.getParticipant(id)),
  ]);

  const found = targets.filter((t): t is NonNullable<typeof t> => t !== null);

  const validation = validateVote({
    phase: event.phase,
    voterId: session.pid,
    targetIds: unique,
    eventId: event.id,
    existingVote: existingVotes[0] ?? null,
    targets: found.map((t) => ({ id: t.id, eventId: t.eventId, attending: t.attending })),
    voterAttending: me?.attending ?? false,
  });
  if (!validation.ok) {
    throw new ServiceError(validation.reason, VOTE_REJECTION_MESSAGE[validation.reason], 403);
  }

  await repo.insertVotes(event.id, session.pid, unique);
  return { targetDisplayNames: found.map((t) => t.displayName) };
}

export interface MyPick {
  participantId: string;
  displayName: string;
  /** 本当にSPYだったか */
  correct: boolean;
}

export interface SpyCatcher {
  participantId: string;
  displayName: string;
  affiliation: string | null;
  /** 当てたSPYの人数 */
  correctSpies: number;
}

export interface ParticipantResult extends GameResult {
  /** 自分が選んだ人と、その当たり外れ */
  myPicks: MyPick[];
  myCorrectSpies: number;
  /** SPYを1人以上当てた人（当てた数の多い順）。正体公開後だけ出す */
  catchers: SpyCatcher[];
  /** クエスト達成率とSPY正解を合わせた総合順位 */
  finalRanking: FinalRankingRow[];
  /** 自分の総合順位 */
  myFinalRow: FinalRankingRow | null;
}

export async function getResultForParticipant(): Promise<ParticipantResult> {
  const session = await requireSession();
  const repo = getRepo();
  const event = await repo.getEvent(session.eid);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);
  if (!isIdentityRevealed(event.phase)) {
    throw new ServiceError('NOT_REVEALED', 'まだ正体は公開されていません。', 403);
  }

  const [participants, votes, ranking] = await Promise.all([
    repo.listParticipants(event.id),
    repo.listVotes(event.id),
    buildRanking(event.id, event.phase),
  ]);

  const result = computeResults(participants, votes);
  const finalRanking = computeFinalRanking(ranking, participants, votes);

  return {
    ...result,
    ...myPicksAndCatchers(participants, votes, session.pid, finalRanking),
    finalRanking,
    myFinalRow: finalRanking.find((r) => r.participantId === session.pid) ?? null,
  };
}

/**
 * 自分が選んだ人の当たり外れと、SPYを当てた人の一覧。
 *
 * 外した人が誰に投票したかは出さない。
 * 「誰が誰を疑ったか」は当日の空気を悪くしうるので、
 * 出すのは当てた人と、その当てた数だけにする。
 */
function myPicksAndCatchers(
  participants: readonly Participant[],
  votes: readonly Vote[],
  myId: string,
  finalRanking: readonly FinalRankingRow[],
): { myPicks: MyPick[]; myCorrectSpies: number; catchers: SpyCatcher[] } {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const spyIds = new Set(
    participants.filter((p) => p.role === 'SPY' && p.attending).map((p) => p.id),
  );

  const myPicks: MyPick[] = votes
    .filter((v) => v.voterParticipantId === myId)
    .map((v) => byId.get(v.targetParticipantId))
    .filter((p): p is Participant => Boolean(p))
    .map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      correct: spyIds.has(p.id),
    }));

  const catchers: SpyCatcher[] = finalRanking
    .filter((r) => r.correctSpies > 0)
    .map((r) => ({
      participantId: r.participantId,
      displayName: r.displayName,
      affiliation: r.affiliation,
      correctSpies: r.correctSpies,
    }))
    .sort(
      (a, b) => b.correctSpies - a.correctSpies || a.displayName.localeCompare(b.displayName, 'ja'),
    );

  return {
    myPicks,
    myCorrectSpies: myPicks.filter((p) => p.correct).length,
    catchers,
  };
}

/* --------------------------- プッシュ通知 --------------------------- */

export async function subscribeToPush(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const session = await requireSession();
  const repo = getRepo();
  const me = await repo.getParticipant(session.pid);
  if (!me || me.eventId !== session.eid) {
    throw new ServiceError('SESSION_INVALID', '参加情報が見つかりません。', 401);
  }
  await repo.savePushSubscription({
    eventId: me.eventId,
    participantId: me.id,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
  });
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  await requireSession();
  await getRepo().deletePushSubscription(endpoint);
}

export async function getMyPublicProfile(): Promise<PublicParticipant> {
  const session = await requireSession();
  const repo = getRepo();
  const me = await repo.getParticipant(session.pid);
  if (!me) throw new ServiceError('SESSION_INVALID', '参加情報が見つかりません。', 401);
  return toPublicParticipant(me);
}
