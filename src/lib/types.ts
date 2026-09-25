/**
 * BUZZ BASE - ドメイン型定義
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

/** MISSION の難易度。参加者には1段階ずつ配る（得点には使わない） */
export const MISSION_DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'] as const;
export type MissionDifficulty = (typeof MISSION_DIFFICULTIES)[number];

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
  /**
   * SPY MISSION の内容を全員に見せるか。
   *
   * false にすると、公開のフェーズに進んでもSPY本人以外には出さない。
   * 「SPYが何をしているのか分からないまま探す」進行にしたいときに使う。
   * 画面だけでなくサーバー側の取得でも外すので、通信を覗いても見えない。
   */
  spyMissionPublic: boolean;
  registrationOpen: boolean;
  phase: GamePhase;
  phaseChangedAt: string;
  /** OPERATION START を押した時刻。残り時間計算の基準 */
  activeStartedAt: string | null;
  /** しまってある日時。null なら現役のイベント */
  archivedAt: string | null;
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
  /** 運営が発行したログインID。未発行なら null（参加用リンクのみで入る人） */
  loginId: string | null;
  /**
   * 当日その人が来ているか。ドタキャンを運営が false にする。
   * false の人はログイン・SPY抽選・投票・集計のすべてから外れる。
   */
  attending: boolean;
  /** パスワードを続けて間違えた回数。総当たりを止めるために数える */
  failedLoginCount: number;
  /** この時刻まではログインを受け付けない。null なら止めていない */
  loginLockedUntil: string | null;
  /**
   * 最初にアプリへ入れた時刻。null なら、まだ一度も入れていない。
   *
   * 受付で「配ったQRをちゃんと読めたか」を見るための印。
   * 一度入ったら上書きしない（何度開き直しても最初の時刻のまま）。
   */
  enteredAt: string | null;
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
  difficulty: MissionDifficulty;
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
  difficulty: MissionDifficulty;
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
  /** 自分が選んだ相手のID。空なら未投票（名前は投票画面で引く） */
  votedTargetIds: string[];
  participantCount: number;
}

/** 参加者ごとのクエスト進捗。達成率の計算に使う */
export interface MissionProgress {
  participantId: string;
  /** 一般クエストの達成数。SPY MISSION は含めない */
  completed: number;
  /** 一般クエストの配布数 */
  total: number;
  /** SPY MISSION の達成数。SPY以外は 0 */
  spyCompleted: number;
  /** SPY MISSION の配布数。SPY以外は 0 */
  spyTotal: number;
  /**
   * 最後に一般クエストを達成した時刻。
   * 達成率が同じ人の並び順（早く達成した人が上）に使う。
   */
  lastCompletedAt: string | null;
  /** 最後に SPY MISSION を達成した時刻。正体公開後の並び順に使う */
  lastSpyCompletedAt: string | null;
}

/** クエストの達成率ランキングの1行。role は決して含めない */
export interface RankingRow {
  /** 達成率が同じ人は同じ順位（1位が複数いてよい） */
  rank: number;
  participantId: string;
  displayName: string;
  affiliation: string | null;
  completed: number;
  total: number;
  /** 0〜100 の整数 */
  percent: number;
  /** 最後に達成した時刻。同率のときの並び順に使う */
  lastCompletedAt: string | null;
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
  /** SPYを1人以上当てた「人数」 */
  correctVoters: number;
  /** SPYに当たった「票数」（1人が複数選べるため人数とは別） */
  correctBallots: number;
}
