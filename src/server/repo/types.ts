import type {
  AssignedMission,
  GamePhase,
  Mission,
  MissionKind,
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
  active: boolean;
}

export interface NotificationInput {
  eventId: string;
  title: string;
  body: string;
  kind: NotificationKind;
}

export interface MissionProgress {
  participantId: string;
  completed: number;
  total: number;
}

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
  }): Promise<Participant>;
  getParticipant(id: string): Promise<Participant | null>;
  /** 機密（role を含む）。管理者権限を確認した後にのみ呼ぶこと */
  listParticipants(eventId: string): Promise<Participant[]>;
  findParticipantByName(eventId: string, displayName: string): Promise<Participant | null>;
  findParticipantByLoginId(eventId: string, loginId: string): Promise<Participant | null>;
  /**
   * ログイン照合用にパスワードハッシュを取り出す。
   * ハッシュを `Participant` 型に載せないことで、画面やAPIへ紛れ込む経路を型で塞ぐ。
   */
  getParticipantPasswordHash(participantId: string): Promise<string | null>;
  setParticipantCredentials(
    participantId: string,
    input: { loginId?: string; passwordHash?: string },
  ): Promise<Participant>;
  setParticipantRole(participantId: string, role: ParticipantRole): Promise<Participant>;
  setParticipantRoles(eventId: string, spyIds: string[]): Promise<Participant[]>;

  /* --------------- missions --------------- */
  listMissions(eventId: string): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  createMission(input: MissionInput): Promise<Mission>;
  updateMission(id: string, input: Partial<MissionInput>): Promise<Mission>;
  deleteMission(id: string): Promise<void>;

  listAssignedMissions(participantId: string, kind?: MissionKind): Promise<AssignedMission[]>;
  assignGeneralMissions(participantId: string): Promise<AssignedMission[]>;
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
