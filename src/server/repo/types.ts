import type {
  AssignedMission,
  GamePhase,
  Mission,
  MissionDifficulty,
  MissionKind,
  MissionProgress,
  Participant,
  ParticipantRole,
  PhaseHistoryEntry,
  PushSubscriptionRecord,
  SpyEvent,
  SpyNotification,
  Vote,
  NotificationKind,
} from '@/lib/types';

export interface EventInput {
  name: string;
  code: string;
  startsAt: string;
  durationMinutes: number;
  spyRevealOffsetMinutes: number;
  spyCount: number;
  registrationOpen: boolean;
}

export interface MissionInput {
  eventId: string | null;
  code: string;
  title: string;
  body: string;
  kind: MissionKind;
  difficulty: MissionDifficulty;
  active: boolean;
}

export interface NotificationInput {
  eventId: string;
  title: string;
  body: string;
  kind: NotificationKind;
}

export type { MissionProgress } from '@/lib/types';

/**
 * データアクセス抽象。
 * デモモード（メモリ）と Supabase(PostgreSQL) の両方が実装する。
 * 権限チェックは呼び出し側（src/server/service.ts）で必ず行う。
 */
export interface Repo {
  readonly kind: 'demo' | 'supabase';

  /* ---------------- events ---------------- */
  listEvents(): Promise<SpyEvent[]>;
  getEvent(id: string): Promise<SpyEvent | null>;
  getEventByCode(code: string): Promise<SpyEvent | null>;
  createEvent(input: EventInput): Promise<SpyEvent>;
  updateEvent(id: string, input: Partial<EventInput>): Promise<SpyEvent>;
  setPhase(eventId: string, to: GamePhase, changedBy: string | null): Promise<SpyEvent>;
  listPhaseHistory(eventId: string): Promise<PhaseHistoryEntry[]>;

  /* ------------- participants ------------- */
  createParticipant(input: {
    eventId: string;
    displayName: string;
    affiliation: string | null;
    /** 運営が代理登録したときのみ設定する */
    loginId?: string | null;
    passwordHash?: string | null;
    /** 受付で伝えるために保存する数字4桁。表示専用で照合には使わない */
    issuedPassword?: string | null;
  }): Promise<Participant>;
  getParticipant(id: string): Promise<Participant | null>;
  /** 機密（role を含む）。管理者権限を確認した後にのみ呼ぶこと */
  listParticipants(eventId: string): Promise<Participant[]>;
  /** 人数だけを数える。参加者の行を運ばないので、画面の定期更新から呼べる */
  countParticipants(eventId: string): Promise<number>;
  findParticipantByName(eventId: string, displayName: string): Promise<Participant | null>;
  findParticipantByLoginId(eventId: string, loginId: string): Promise<Participant | null>;
  /**
   * ログイン照合用にパスワードハッシュを取り出す。
   * ハッシュを `Participant` 型に載せないことで、画面やAPIへ紛れ込む経路を型で塞ぐ。
   */
  getParticipantPasswordHash(participantId: string): Promise<string | null>;
  setParticipantCredentials(
    participantId: string,
    input: { loginId?: string; passwordHash?: string; issuedPassword?: string },
  ): Promise<Participant>;
  /**
   * 運営画面に出すための、発行済みパスワード（数字4桁）の一覧。
   *
   * Participant 型には載せない。載せると参加者向けの応答へ紛れ込む経路が
   * できてしまうため、運営用のこの口だけから取れるようにしている。
   * 呼ぶ前に必ず運営権限を確認すること。
   */
  listIssuedPasswords(eventId: string): Promise<Record<string, string | null>>;
  setParticipantRole(participantId: string, role: ParticipantRole): Promise<Participant>;
  setParticipantRoles(eventId: string, spyIds: string[]): Promise<Participant[]>;
  /** 当日の欠席／出席を切り替える。運営だけが呼べること（権限確認は呼び出し側） */
  setParticipantAttendance(participantId: string, attending: boolean): Promise<Participant>;
  /**
   * ログインの試行回数と一時停止の記録を書き換える。
   * パスワードの総当たりを止めるために使う。
   */
  setParticipantLoginAttempts(
    participantId: string,
    input: { failedLoginCount: number; loginLockedUntil: string | null },
  ): Promise<void>;

  /* --------------- missions --------------- */
  listMissions(eventId: string): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  createMission(input: MissionInput): Promise<Mission>;
  updateMission(id: string, input: Partial<MissionInput>): Promise<Mission>;
  deleteMission(id: string): Promise<void>;

  listAssignedMissions(participantId: string, kind?: MissionKind): Promise<AssignedMission[]>;
  assignGeneralMissions(participantId: string): Promise<AssignedMission[]>;
  /**
   * 未配布の参加者へまとめて一般MISSIONを配る。
   *
   * 1人ずつ assignGeneralMissions を呼ぶと参加者数×往復になり、
   * 100人規模でサーバーの実行時間上限を超える。ここは人数によらず
   * 一定回数の問い合わせで済ませる。
   */
  distributeGeneralMissions(eventId: string): Promise<{ assigned: number }>;
  assignSpyMissions(participantId: string): Promise<AssignedMission[]>;
  clearSpyMissionAssignments(participantId: string): Promise<void>;
  setMissionCompleted(
    participantId: string,
    assignmentId: string,
    completed: boolean,
  ): Promise<AssignedMission | null>;
  missionProgress(eventId: string): Promise<MissionProgress[]>;

  /* ------------- notifications ------------ */
  listNotifications(eventId: string): Promise<SpyNotification[]>;
  createNotification(input: NotificationInput): Promise<SpyNotification>;

  /* ----------------- votes ---------------- */
  getVoteByVoter(eventId: string, voterId: string): Promise<Vote | null>;
  listVotes(eventId: string): Promise<Vote[]>;
  insertVote(eventId: string, voterId: string, targetId: string): Promise<Vote>;

  /* ------------- push 通知 ---------------- */
  savePushSubscription(input: {
    eventId: string;
    participantId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  listPushSubscriptions(eventId: string): Promise<PushSubscriptionRecord[]>;

  /* ----------------- admin ---------------- */
  isEventAdmin(eventId: string, adminId: string): Promise<boolean>;
  /**
   * イベントの管理者を追加する。
   * イベント作成直後にこれを呼ばないと、作った本人が自分のイベントを操作できなくなる。
   */
  addEventAdmin(eventId: string, userId: string): Promise<void>;
}
