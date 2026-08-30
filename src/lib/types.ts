/**
 * SOCIAL SPY - ドメイン型定義
 *
 * 重要:
 *  - `Participant` は role を含む「機密」型。参加者向けAPIからは絶対に返さない。
 *  - 参加者向けには必ず `PublicParticipant` を使う（型レベルで role を排除）。
 */

export const GAME_PHASES = [
  'LOBBY',
  'ACTIVE',
  'SPY_MISSION_REVEALED',
  'VOTING',
  'IDENTITY_REVEALED',
  'FINISHED',
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export type ParticipantRole = 'AGENT' | 'SPY';

export type MissionKind = 'GENERAL' | 'SPY';

export type NotificationKind = 'INFO' | 'PHASE' | 'ALERT' | 'CLASSIFIED';

export interface SpyEvent {
  id: string;
  name: string;
  code: string;
  startsAt: string;
  durationMinutes: number;
  /** ACTIVE 開始から何分後に SPY MISSION を公開する想定か（運営の目安） */
  spyRevealOffsetMinutes: number;
  spyCount: number;
  registrationOpen: boolean;
  phase: GamePhase;
  phaseChangedAt: string;
  /** OPERATION START を押した時刻。残り時間計算の基準 */
  activeStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  id: string;
  eventId: string;
  displayName: string;
  affiliation: string | null;
  /** 機密。参加者向けレスポンスに含めてはならない */
  role: ParticipantRole;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** 参加者向けに公開してよい参加者情報（role を含まない） */
export interface PublicParticipant {
  id: string;
  eventId: string;
  displayName: string;
  affiliation: string | null;
  joinedAt: string;
}

export interface Mission {
  id: string;
  eventId: string | null;
  /** 見出し用の英字コード（例: SNS EXCHANGE） */
  code: string;
  title: string;
  body: string;
  kind: MissionKind;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantMission {
  id: string;
  participantId: string;
  missionId: string;
  orderIndex: number;
  completed: boolean;
  completedAt: string | null;
}

/** MISSION 本体とアサイン状態を結合した表示用の型 */
export interface AssignedMission {
  assignmentId: string;
  missionId: string;
  orderIndex: number;
  code: string;
  title: string;
  body: string;
  kind: MissionKind;
  completed: boolean;
  completedAt: string | null;
}

export interface SpyNotification {
  id: string;
  eventId: string;
  title: string;
  body: string;
  kind: NotificationKind;
  createdAt: string;
}

export interface Vote {
  id: string;
  eventId: string;
  voterParticipantId: string;
  targetParticipantId: string;
  createdAt: string;
}

export interface PhaseHistoryEntry {
  id: string;
  eventId: string;
  fromPhase: GamePhase | null;
  toPhase: GamePhase;
  changedBy: string | null;
  changedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
}

/** プッシュ通知の購読情報（端末ごと） */
export interface PushSubscriptionRecord {
  id: string;
  eventId: string;
  participantId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

/** 参加者画面が必要とする状態のスナップショット（role は自分の分のみ） */
export interface ParticipantGameState {
  event: {
    id: string;
    name: string;
    code: string;
    phase: GamePhase;
    phaseChangedAt: string;
    activeStartedAt: string | null;
    durationMinutes: number;
    endsAt: string | null;
  };
  me: {
    id: string;
    displayName: string;
    affiliation: string | null;
    /** 自分自身の役割のみ。他人の役割は決して含まれない */
    role: ParticipantRole;
    isSpy: boolean;
  };
  missions: AssignedMission[];
  completedCount: number;
  totalCount: number;
  /** SPY MISSION の内容。公開フェーズ前は自分がSPYの場合のみ入る */
  spyMissions: AssignedMission[] | null;
  spyMissionsPublic: boolean;
  notifications: SpyNotification[];
  vote: { targetParticipantId: string; targetDisplayName: string } | null;
  participantCount: number;
}

export interface VoteResultRow {
  participantId: string;
  displayName: string;
  affiliation: string | null;
  votes: number;
  isSpy: boolean;
}

export interface GameResult {
  spies: PublicParticipant[];
  rows: VoteResultRow[];
  totalVotes: number;
  totalParticipants: number;
  correctVoters: number;
}
