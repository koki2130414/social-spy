import type {
  AssignedMission,
  GamePhase,
  Mission,
  MissionKind,
  Participant,
  ParticipantMission,
  ParticipantRole,
  PhaseHistoryEntry,
  PushSubscriptionRecord,
  SpyEvent,
  SpyNotification,
  Vote,
} from '@/lib/types';
import { pickMissionsForParticipant, pickSpyMissions } from '@/lib/core/missions';
import { normalizeEventCode } from '@/lib/utils';
import {
  buildDemoDataset,
  buildSampleVotes,
  DEMO_ADMIN_ID,
  DEMO_AGENT_PARTICIPANT_ID,
  DEMO_SPY_PARTICIPANT_ID,
  type DemoDataset,
} from '@/server/demo/seed';
import type {
  EventInput,
  MissionInput,
  MissionProgress,
  NotificationInput,
  Repo,
} from './types';

interface DemoState extends DemoDataset {
  /** 実際に人が操作している参加者（サンプル自動投票の対象外にする） */
  interactiveParticipantIds: Set<string>;
  pushSubscriptions: PushSubscriptionRecord[];
  seq: number;
}

function createState(): DemoState {
  const data = buildDemoDataset();
  return {
    ...data,
    interactiveParticipantIds: new Set([DEMO_AGENT_PARTICIPANT_ID, DEMO_SPY_PARTICIPANT_ID]),
    pushSubscriptions: [],
    seq: 0,
  };
}

const GLOBAL_KEY = Symbol.for('social-spy.demo-state');

type GlobalWithState = typeof globalThis & { [GLOBAL_KEY]?: DemoState };

function state(): DemoState {
  const g = globalThis as GlobalWithState;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createState();
  return g[GLOBAL_KEY];
}

export function resetDemoState(): void {
  (globalThis as GlobalWithState)[GLOBAL_KEY] = createState();
}

function nextId(prefix: string): string {
  const s = state();
  s.seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${s.seq.toString(36)}`;
}

const now = () => new Date().toISOString();

function toAssigned(pm: ParticipantMission, mission: Mission): AssignedMission {
  return {
    assignmentId: pm.id,
    missionId: mission.id,
    orderIndex: pm.orderIndex,
    code: mission.code,
    title: mission.title,
    body: mission.body,
    kind: mission.kind,
    completed: pm.completed,
    completedAt: pm.completedAt,
  };
}

export class DemoRepo implements Repo {
  readonly kind = 'demo' as const;

  /* ---------------- events ---------------- */

  async listEvents(): Promise<SpyEvent[]> {
    return [...state().events];
  }

  async getEvent(id: string): Promise<SpyEvent | null> {
    return state().events.find((e) => e.id === id) ?? null;
  }

  async getEventByCode(code: string): Promise<SpyEvent | null> {
    const normalized = normalizeEventCode(code);
    return state().events.find((e) => e.code === normalized) ?? null;
  }

  async createEvent(input: EventInput): Promise<SpyEvent> {
    const event: SpyEvent = {
      id: nextId('ev'),
      ...input,
      code: normalizeEventCode(input.code),
      phase: 'LOBBY',
      phaseChangedAt: now(),
      activeStartedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    state().events.push(event);
    state().phaseHistory.push({
      id: nextId('ph'),
      eventId: event.id,
      fromPhase: null,
      toPhase: 'LOBBY',
      changedBy: DEMO_ADMIN_ID,
      changedAt: now(),
    });
    return event;
  }

  async updateEvent(id: string, input: Partial<EventInput>): Promise<SpyEvent> {
    const event = state().events.find((e) => e.id === id);
    if (!event) throw new Error('EVENT_NOT_FOUND');
    Object.assign(event, input, {
      code: input.code ? normalizeEventCode(input.code) : event.code,
      updatedAt: now(),
    });
    return event;
  }

  async setPhase(eventId: string, to: GamePhase, changedBy: string | null): Promise<SpyEvent> {
    const s = state();
    const event = s.events.find((e) => e.id === eventId);
    if (!event) throw new Error('EVENT_NOT_FOUND');
    const from = event.phase;
    event.phase = to;
    event.phaseChangedAt = now();
    if (to === 'ACTIVE' && !event.activeStartedAt) event.activeStartedAt = now();
    if (to === 'VOTING' || to === 'IDENTITY_REVEALED' || to === 'FINISHED') {
      event.registrationOpen = false;
    }
    event.updatedAt = now();

    s.phaseHistory.push({
      id: nextId('ph'),
      eventId,
      fromPhase: from,
      toPhase: to,
      changedBy,
      changedAt: now(),
    });

    // デモ体験のため、投票フェーズに入ったらNPCのサンプル投票を生成する
    if (to === 'VOTING') {
      const participants = s.participants.filter((p) => p.eventId === eventId);
      const votes = s.votes.filter((v) => v.eventId === eventId);
      const sample = buildSampleVotes(participants, votes, [...s.interactiveParticipantIds]);
      s.votes.push(...sample);
    }
    return event;
  }

  async listPhaseHistory(eventId: string): Promise<PhaseHistoryEntry[]> {
    return state()
      .phaseHistory.filter((p) => p.eventId === eventId)
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  }

  /* ------------- participants ------------- */

  async createParticipant(input: {
    eventId: string;
    displayName: string;
    affiliation: string | null;
  }): Promise<Participant> {
    const p: Participant = {
      id: nextId('pt'),
      eventId: input.eventId,
      displayName: input.displayName,
      affiliation: input.affiliation,
      role: 'AGENT',
      joinedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    const s = state();
    s.participants.push(p);
    s.interactiveParticipantIds.add(p.id);
    return p;
  }

  async getParticipant(id: string): Promise<Participant | null> {
    return state().participants.find((p) => p.id === id) ?? null;
  }

  async listParticipants(eventId: string): Promise<Participant[]> {
    return state()
      .participants.filter((p) => p.eventId === eventId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }

  async findParticipantByName(eventId: string, displayName: string): Promise<Participant | null> {
    return (
      state().participants.find(
        (p) => p.eventId === eventId && p.displayName.trim() === displayName.trim(),
      ) ?? null
    );
  }

  async setParticipantRole(participantId: string, role: ParticipantRole): Promise<Participant> {
    const p = state().participants.find((x) => x.id === participantId);
    if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
    p.role = role;
    p.updatedAt = now();
    if (role === 'SPY') {
      await this.assignSpyMissions(participantId);
    } else {
      await this.clearSpyMissionAssignments(participantId);
    }
    return p;
  }

  async setParticipantRoles(eventId: string, spyIds: string[]): Promise<Participant[]> {
    const spySet = new Set(spyIds);
    const list = state().participants.filter((p) => p.eventId === eventId);
    for (const p of list) {
      await this.setParticipantRole(p.id, spySet.has(p.id) ? 'SPY' : 'AGENT');
    }
    return list;
  }

  /* --------------- missions --------------- */

  async listMissions(eventId: string): Promise<Mission[]> {
    return state()
      .missions.filter((m) => m.eventId === eventId || m.eventId === null)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.createdAt.localeCompare(b.createdAt));
  }

  async getMission(id: string): Promise<Mission | null> {
    return state().missions.find((m) => m.id === id) ?? null;
  }

  async createMission(input: MissionInput): Promise<Mission> {
    const m: Mission = { id: nextId('ms'), ...input, createdAt: now(), updatedAt: now() };
    state().missions.push(m);
    return m;
  }

  async updateMission(id: string, input: Partial<MissionInput>): Promise<Mission> {
    const m = state().missions.find((x) => x.id === id);
    if (!m) throw new Error('MISSION_NOT_FOUND');
    Object.assign(m, input, { updatedAt: now() });
    return m;
  }

  async deleteMission(id: string): Promise<void> {
    const s = state();
    s.missions = s.missions.filter((m) => m.id !== id);
    s.participantMissions = s.participantMissions.filter((pm) => pm.missionId !== id);
  }

  async listAssignedMissions(participantId: string, kind?: MissionKind): Promise<AssignedMission[]> {
    const s = state();
    return s.participantMissions
      .filter((pm) => pm.participantId === participantId)
      .map((pm) => {
        const mission = s.missions.find((m) => m.id === pm.missionId);
        return mission ? toAssigned(pm, mission) : null;
      })
      .filter((x): x is AssignedMission => x !== null)
      .filter((x) => (kind ? x.kind === kind : true))
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async assignGeneralMissions(participantId: string): Promise<AssignedMission[]> {
    const s = state();
    const participant = s.participants.find((p) => p.id === participantId);
    if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');

    const existing = s.participantMissions.filter((pm) => pm.participantId === participantId);
    const existingGeneral = existing.filter((pm) => {
      const m = s.missions.find((x) => x.id === pm.missionId);
      return m?.kind === 'GENERAL';
    });
    if (existingGeneral.length > 0) return this.listAssignedMissions(participantId, 'GENERAL');

    const missions = await this.listMissions(participant.eventId);
    const picks = pickMissionsForParticipant(missions, {
      excludeMissionIds: existing.map((pm) => pm.missionId),
    });
    for (const a of picks) {
      s.participantMissions.push({
        id: nextId('pm'),
        participantId,
        missionId: a.missionId,
        orderIndex: a.orderIndex,
        completed: false,
        completedAt: null,
      });
    }
    return this.listAssignedMissions(participantId, 'GENERAL');
  }

  async assignSpyMissions(participantId: string): Promise<AssignedMission[]> {
    const s = state();
    const participant = s.participants.find((p) => p.id === participantId);
    if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
    const missions = await this.listMissions(participant.eventId);
    const existing = new Set(
      s.participantMissions.filter((pm) => pm.participantId === participantId).map((pm) => pm.missionId),
    );
    for (const a of pickSpyMissions(missions)) {
      if (existing.has(a.missionId)) continue;
      s.participantMissions.push({
        id: nextId('pm'),
        participantId,
        missionId: a.missionId,
        orderIndex: a.orderIndex,
        completed: false,
        completedAt: null,
      });
    }
    return this.listAssignedMissions(participantId, 'SPY');
  }

  async clearSpyMissionAssignments(participantId: string): Promise<void> {
    const s = state();
    s.participantMissions = s.participantMissions.filter((pm) => {
      if (pm.participantId !== participantId) return true;
      const mission = s.missions.find((m) => m.id === pm.missionId);
      return mission?.kind !== 'SPY';
    });
  }

  async setMissionCompleted(
    participantId: string,
    assignmentId: string,
    completed: boolean,
  ): Promise<AssignedMission | null> {
    const s = state();
    const pm = s.participantMissions.find(
      (x) => x.id === assignmentId && x.participantId === participantId,
    );
    if (!pm) return null;
    pm.completed = completed;
    pm.completedAt = completed ? now() : null;
    const mission = s.missions.find((m) => m.id === pm.missionId);
    return mission ? toAssigned(pm, mission) : null;
  }

  async missionProgress(eventId: string): Promise<MissionProgress[]> {
    const s = state();
    const participants = s.participants.filter((p) => p.eventId === eventId);
    return participants.map((p) => {
      const list = s.participantMissions.filter((pm) => pm.participantId === p.id);
      const general = list.filter((pm) => {
        const m = s.missions.find((x) => x.id === pm.missionId);
        return m?.kind === 'GENERAL';
      });
      return {
        participantId: p.id,
        completed: general.filter((pm) => pm.completed).length,
        total: general.length,
      };
    });
  }

  /* ------------- notifications ------------ */

  async listNotifications(eventId: string): Promise<SpyNotification[]> {
    return state()
      .notifications.filter((n) => n.eventId === eventId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createNotification(input: NotificationInput): Promise<SpyNotification> {
    const n: SpyNotification = { id: nextId('nt'), ...input, createdAt: now() };
    state().notifications.push(n);
    return n;
  }

  /* ----------------- votes ---------------- */

  async getVoteByVoter(eventId: string, voterId: string): Promise<Vote | null> {
    return (
      state().votes.find((v) => v.eventId === eventId && v.voterParticipantId === voterId) ?? null
    );
  }

  async listVotes(eventId: string): Promise<Vote[]> {
    return state().votes.filter((v) => v.eventId === eventId);
  }

  async insertVote(eventId: string, voterId: string, targetId: string): Promise<Vote> {
    const s = state();
    // DB の UNIQUE / CHECK 制約に相当する不変条件をここでも担保する
    if (voterId === targetId) throw new Error('SELF_VOTE_FORBIDDEN');
    if (s.votes.some((v) => v.eventId === eventId && v.voterParticipantId === voterId)) {
      throw new Error('ALREADY_VOTED');
    }
    const vote: Vote = {
      id: nextId('vt'),
      eventId,
      voterParticipantId: voterId,
      targetParticipantId: targetId,
      createdAt: now(),
    };
    s.votes.push(vote);
    return vote;
  }

  /* ------------- push 通知 ---------------- */

  async savePushSubscription(input: {
    eventId: string;
    participantId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<void> {
    const s = state();
    s.pushSubscriptions = s.pushSubscriptions.filter((p) => p.endpoint !== input.endpoint);
    s.pushSubscriptions.push({ id: nextId('ps'), ...input, createdAt: now() });
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    const s = state();
    s.pushSubscriptions = s.pushSubscriptions.filter((p) => p.endpoint !== endpoint);
  }

  async listPushSubscriptions(eventId: string): Promise<PushSubscriptionRecord[]> {
    return state().pushSubscriptions.filter((p) => p.eventId === eventId);
  }

  /* ----------------- admin ---------------- */

  async isEventAdmin(eventId: string, adminId: string): Promise<boolean> {
    // デモモードではデモ管理者が全イベントを管理する
    return adminId === DEMO_ADMIN_ID && state().events.some((e) => e.id === eventId);
  }
}
