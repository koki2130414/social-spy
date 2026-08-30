import type {
  AssignedMission,
  GameResult,
  ParticipantGameState,
  PublicParticipant,
} from '@/lib/types';
import { canRegister, canUpdateMissionProgress, isIdentityRevealed } from '@/lib/core/phase';
import { visibleSpyMissions } from '@/lib/core/intel';
import { toPublicParticipant, toPublicParticipants } from '@/lib/core/spy';
import { computeResults, validateVote, VOTE_REJECTION_MESSAGE } from '@/lib/core/vote';
import { getRepo } from '@/server/repo';
import { ServiceError } from '@/server/errors';
import {
  getParticipantSession,
  setParticipantSession,
  type ParticipantSession,
} from '@/server/auth/session';
import { verifyPassword } from '@/server/auth/password';
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

  if (!event) throw failed();

  const participant = await repo.findParticipantByLoginId(
    event.id,
    normalizeLoginId(input.loginId),
  );
  if (!participant) throw failed();

  const hash = await repo.getParticipantPasswordHash(participant.id);
  if (!hash) throw failed();
  if (!(await verifyPassword(input.password, hash))) throw failed();

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

  const [assigned, notifications, vote, participants] = await Promise.all([
    repo.listAssignedMissions(me.id),
    repo.listNotifications(event.id),
    repo.getVoteByVoter(event.id, me.id),
    repo.listParticipants(event.id),
  ]);

  const generalMissions = assigned.filter((m) => m.kind === 'GENERAL');
  const ownSpyMissions = assigned.filter((m) => m.kind === 'SPY');

  // 公開用のSPY MISSION一覧（内容のみ。誰の達成状況かは分からない）
  const eventMissions = await repo.listMissions(event.id);
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
      completed: false,
      completedAt: null,
    }));

  const spyMissions = visibleSpyMissions({
    phase: event.phase,
    isSpy: me.role === 'SPY',
    ownSpyMissions,
    publicSpyMissions,
  });

  const votedTarget = vote ? participants.find((p) => p.id === vote.targetParticipantId) : null;

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
      isSpy: me.role === 'SPY',
    },
    missions: generalMissions,
    completedCount: generalMissions.filter((m) => m.completed).length,
    totalCount: generalMissions.length,
    spyMissions,
    spyMissionsPublic: spyMissions !== null && me.role !== 'SPY',
    notifications,
    vote: votedTarget
      ? { targetParticipantId: votedTarget.id, targetDisplayName: votedTarget.displayName }
      : null,
    participantCount: participants.length,
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

/** 投票対象の一覧（自分以外・role を含まない） */
export async function listVoteCandidates(): Promise<PublicParticipant[]> {
  const session = await requireSession();
  const repo = getRepo();
  const participants = await repo.listParticipants(session.eid);
  return toPublicParticipants(participants.filter((p) => p.id !== session.pid));
}

export async function castVote(targetId: string): Promise<{ targetDisplayName: string }> {
  const session = await requireSession();
  const repo = getRepo();

  const event = await repo.getEvent(session.eid);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);

  const [existingVote, target] = await Promise.all([
    repo.getVoteByVoter(event.id, session.pid),
    repo.getParticipant(targetId),
  ]);

  const validation = validateVote({
    phase: event.phase,
    voterId: session.pid,
    targetId,
    eventId: event.id,
    existingVote,
    target: target ? { id: target.id, eventId: target.eventId } : null,
  });
  if (!validation.ok) {
    throw new ServiceError(validation.reason, VOTE_REJECTION_MESSAGE[validation.reason], 403);
  }

  await repo.insertVote(event.id, session.pid, targetId);
  return { targetDisplayName: target!.displayName };
}

export interface ParticipantResult extends GameResult {
  myVote: { targetParticipantId: string; targetDisplayName: string } | null;
  myVoteCorrect: boolean | null;
}

export async function getResultForParticipant(): Promise<ParticipantResult> {
  const session = await requireSession();
  const repo = getRepo();
  const event = await repo.getEvent(session.eid);
  if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'イベントが見つかりません。', 404);
  if (!isIdentityRevealed(event.phase)) {
    throw new ServiceError('NOT_REVEALED', 'まだ正体は公開されていません。', 403);
  }

  const [participants, votes, myVote] = await Promise.all([
    repo.listParticipants(event.id),
    repo.listVotes(event.id),
    repo.getVoteByVoter(event.id, session.pid),
  ]);

  const result = computeResults(participants, votes);
  const target = myVote ? participants.find((p) => p.id === myVote.targetParticipantId) : null;

  return {
    ...result,
    myVote: target
      ? { targetParticipantId: target.id, targetDisplayName: target.displayName }
      : null,
    myVoteCorrect: target ? target.role === 'SPY' : null,
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
