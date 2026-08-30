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
} from '@/lib/types';
import { pickMissionsForParticipant, pickSpyMissions } from '@/lib/core/missions';
import { normalizeEventCode } from '@/lib/utils';
import { supabaseAdmin } from '@/server/supabase/clients';
import type {
  EventInput,
  MissionInput,
  MissionProgress,
  NotificationInput,
  Repo,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function mapEvent(r: Row): SpyEvent {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    startsAt: r.starts_at,
    durationMinutes: r.duration_minutes,
    spyRevealOffsetMinutes: r.spy_reveal_offset_minutes,
    spyCount: r.spy_count,
    registrationOpen: r.registration_open,
    phase: r.phase as GamePhase,
    phaseChangedAt: r.phase_changed_at,
    activeStartedAt: r.active_started_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapParticipant(r: Row): Participant {
  return {
    id: r.id,
    eventId: r.event_id,
    displayName: r.display_name,
    affiliation: r.affiliation,
    role: r.role as ParticipantRole,
    joinedAt: r.joined_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMission(r: Row): Mission {
  return {
    id: r.id,
    eventId: r.event_id,
    code: r.code,
    title: r.title,
    body: r.body,
    kind: r.kind as MissionKind,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapNotification(r: Row): SpyNotification {
  return {
    id: r.id,
    eventId: r.event_id,
    title: r.title,
    body: r.body,
    kind: r.kind,
    createdAt: r.created_at,
  };
}

function mapVote(r: Row): Vote {
  return {
    id: r.id,
    eventId: r.event_id,
    voterParticipantId: r.voter_participant_id,
    targetParticipantId: r.target_participant_id,
    createdAt: r.created_at,
  };
}

function mapAssigned(r: Row): AssignedMission {
  const mission = r.missions ?? r.mission;
  return {
    assignmentId: r.id,
    missionId: r.mission_id,
    orderIndex: r.order_index,
    code: mission?.code ?? '',
    title: mission?.title ?? '',
    body: mission?.body ?? '',
    kind: (mission?.kind ?? 'GENERAL') as MissionKind,
    completed: r.completed,
    completedAt: r.completed_at,
  };
}

function unwrap<T>(data: T | null, error: { message: string } | null, ctx: string): T {
  if (error) throw new Error(`${ctx}: ${error.message}`);
  if (data === null) throw new Error(`${ctx}: データが取得できませんでした`);
  return data;
}

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;

  private get db() {
    return supabaseAdmin();
  }

  /* ---------------- events ---------------- */

  async listEvents(): Promise<SpyEvent[]> {
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .order('starts_at', { ascending: false });
    return unwrap(data, error, 'listEvents').map(mapEvent);
  }

  async getEvent(id: string): Promise<SpyEvent | null> {
    const { data, error } = await this.db.from('events').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`getEvent: ${error.message}`);
    return data ? mapEvent(data) : null;
  }

  async getEventByCode(code: string): Promise<SpyEvent | null> {
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .eq('code', normalizeEventCode(code))
      .maybeSingle();
    if (error) throw new Error(`getEventByCode: ${error.message}`);
    return data ? mapEvent(data) : null;
  }

  async createEvent(input: EventInput): Promise<SpyEvent> {
    const { data, error } = await this.db
      .from('events')
      .insert({
        name: input.name,
        code: normalizeEventCode(input.code),
        starts_at: input.startsAt,
        duration_minutes: input.durationMinutes,
        spy_reveal_offset_minutes: input.spyRevealOffsetMinutes,
        spy_count: input.spyCount,
        registration_open: input.registrationOpen,
      })
      .select('*')
      .single();
    return mapEvent(unwrap(data, error, 'createEvent'));
  }

  async updateEvent(id: string, input: Partial<EventInput>): Promise<SpyEvent> {
    const patch: Row = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = normalizeEventCode(input.code);
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
    if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
    if (input.spyRevealOffsetMinutes !== undefined)
      patch.spy_reveal_offset_minutes = input.spyRevealOffsetMinutes;
    if (input.spyCount !== undefined) patch.spy_count = input.spyCount;
    if (input.registrationOpen !== undefined) patch.registration_open = input.registrationOpen;

    const { data, error } = await this.db
      .from('events')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    return mapEvent(unwrap(data, error, 'updateEvent'));
  }

  async setPhase(eventId: string, to: GamePhase, changedBy: string | null): Promise<SpyEvent> {
    const current = await this.getEvent(eventId);
    if (!current) throw new Error('EVENT_NOT_FOUND');

    const patch: Row = {
      phase: to,
      phase_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (to === 'ACTIVE' && !current.activeStartedAt) {
      patch.active_started_at = new Date().toISOString();
    }
    if (to === 'VOTING' || to === 'IDENTITY_REVEALED' || to === 'FINISHED') {
      patch.registration_open = false;
    }

    const { data, error } = await this.db
      .from('events')
      .update(patch)
      .eq('id', eventId)
      .select('*')
      .single();
    const event = mapEvent(unwrap(data, error, 'setPhase'));

    await this.db.from('event_phase_history').insert({
      event_id: eventId,
      from_phase: current.phase,
      to_phase: to,
      changed_by: changedBy,
    });
    return event;
  }

  async listPhaseHistory(eventId: string): Promise<PhaseHistoryEntry[]> {
    const { data, error } = await this.db
      .from('event_phase_history')
      .select('*')
      .eq('event_id', eventId)
      .order('changed_at', { ascending: true });
    return unwrap(data, error, 'listPhaseHistory').map((r: Row) => ({
      id: r.id,
      eventId: r.event_id,
      fromPhase: r.from_phase,
      toPhase: r.to_phase,
      changedBy: r.changed_by,
      changedAt: r.changed_at,
    }));
  }

  /* ------------- participants ------------- */

  async createParticipant(input: {
    eventId: string;
    displayName: string;
    affiliation: string | null;
  }): Promise<Participant> {
    const { data, error } = await this.db
      .from('participants')
      .insert({
        event_id: input.eventId,
        display_name: input.displayName,
        affiliation: input.affiliation,
        role: 'AGENT',
      })
      .select('*')
      .single();
    return mapParticipant(unwrap(data, error, 'createParticipant'));
  }

  async getParticipant(id: string): Promise<Participant | null> {
    const { data, error } = await this.db
      .from('participants')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getParticipant: ${error.message}`);
    return data ? mapParticipant(data) : null;
  }

  async listParticipants(eventId: string): Promise<Participant[]> {
    const { data, error } = await this.db
      .from('participants')
      .select('*')
      .eq('event_id', eventId)
      .order('joined_at', { ascending: true });
    return unwrap(data, error, 'listParticipants').map(mapParticipant);
  }

  async findParticipantByName(eventId: string, displayName: string): Promise<Participant | null> {
    const { data, error } = await this.db
      .from('participants')
      .select('*')
      .eq('event_id', eventId)
      .eq('display_name', displayName)
      .maybeSingle();
    if (error) throw new Error(`findParticipantByName: ${error.message}`);
    return data ? mapParticipant(data) : null;
  }

  async setParticipantRole(participantId: string, role: ParticipantRole): Promise<Participant> {
    const { data, error } = await this.db
      .from('participants')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', participantId)
      .select('*')
      .single();
    const participant = mapParticipant(unwrap(data, error, 'setParticipantRole'));
    if (role === 'SPY') await this.assignSpyMissions(participantId);
    else await this.clearSpyMissionAssignments(participantId);
    return participant;
  }

  async setParticipantRoles(eventId: string, spyIds: string[]): Promise<Participant[]> {
    const participants = await this.listParticipants(eventId);
    const spySet = new Set(spyIds);
    for (const p of participants) {
      const role: ParticipantRole = spySet.has(p.id) ? 'SPY' : 'AGENT';
      if (p.role !== role) await this.setParticipantRole(p.id, role);
      else if (role === 'SPY') await this.assignSpyMissions(p.id);
    }
    return this.listParticipants(eventId);
  }

  /* --------------- missions --------------- */

  async listMissions(eventId: string): Promise<Mission[]> {
    const { data, error } = await this.db
      .from('missions')
      .select('*')
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .order('kind', { ascending: true })
      .order('created_at', { ascending: true });
    return unwrap(data, error, 'listMissions').map(mapMission);
  }

  async getMission(id: string): Promise<Mission | null> {
    const { data, error } = await this.db.from('missions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`getMission: ${error.message}`);
    return data ? mapMission(data) : null;
  }

  async createMission(input: MissionInput): Promise<Mission> {
    const { data, error } = await this.db
      .from('missions')
      .insert({
        event_id: input.eventId,
        code: input.code,
        title: input.title,
        body: input.body,
        kind: input.kind,
        active: input.active,
      })
      .select('*')
      .single();
    return mapMission(unwrap(data, error, 'createMission'));
  }

  async updateMission(id: string, input: Partial<MissionInput>): Promise<Mission> {
    const patch: Row = { updated_at: new Date().toISOString() };
    if (input.eventId !== undefined) patch.event_id = input.eventId;
    if (input.code !== undefined) patch.code = input.code;
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.active !== undefined) patch.active = input.active;
    const { data, error } = await this.db
      .from('missions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    return mapMission(unwrap(data, error, 'updateMission'));
  }

  async deleteMission(id: string): Promise<void> {
    const { error } = await this.db.from('missions').delete().eq('id', id);
    if (error) throw new Error(`deleteMission: ${error.message}`);
  }

  async listAssignedMissions(participantId: string, kind?: MissionKind): Promise<AssignedMission[]> {
    const { data, error } = await this.db
      .from('participant_missions')
      .select('*, missions(*)')
      .eq('participant_id', participantId)
      .order('order_index', { ascending: true });
    const rows = unwrap(data, error, 'listAssignedMissions').map(mapAssigned);
    return kind ? rows.filter((r) => r.kind === kind) : rows;
  }

  async assignGeneralMissions(participantId: string): Promise<AssignedMission[]> {
    const participant = await this.getParticipant(participantId);
    if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
    const existing = await this.listAssignedMissions(participantId);
    if (existing.some((m) => m.kind === 'GENERAL')) {
      return existing.filter((m) => m.kind === 'GENERAL');
    }
    const missions = await this.listMissions(participant.eventId);
    const picks = pickMissionsForParticipant(missions, {
      excludeMissionIds: existing.map((m) => m.missionId),
    });
    if (picks.length > 0) {
      const { error } = await this.db.from('participant_missions').insert(
        picks.map((p) => ({
          participant_id: participantId,
          mission_id: p.missionId,
          order_index: p.orderIndex,
        })),
      );
      if (error) throw new Error(`assignGeneralMissions: ${error.message}`);
    }
    return this.listAssignedMissions(participantId, 'GENERAL');
  }

  async assignSpyMissions(participantId: string): Promise<AssignedMission[]> {
    const participant = await this.getParticipant(participantId);
    if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
    const missions = await this.listMissions(participant.eventId);
    const existing = await this.listAssignedMissions(participantId);
    const existingIds = new Set(existing.map((m) => m.missionId));
    const picks = pickSpyMissions(missions).filter((p) => !existingIds.has(p.missionId));
    if (picks.length > 0) {
      const { error } = await this.db.from('participant_missions').insert(
        picks.map((p) => ({
          participant_id: participantId,
          mission_id: p.missionId,
          order_index: p.orderIndex,
        })),
      );
      if (error) throw new Error(`assignSpyMissions: ${error.message}`);
    }
    return this.listAssignedMissions(participantId, 'SPY');
  }

  async clearSpyMissionAssignments(participantId: string): Promise<void> {
    const assigned = await this.listAssignedMissions(participantId, 'SPY');
    if (assigned.length === 0) return;
    const { error } = await this.db
      .from('participant_missions')
      .delete()
      .in(
        'id',
        assigned.map((a) => a.assignmentId),
      );
    if (error) throw new Error(`clearSpyMissionAssignments: ${error.message}`);
  }

  async setMissionCompleted(
    participantId: string,
    assignmentId: string,
    completed: boolean,
  ): Promise<AssignedMission | null> {
    const { data, error } = await this.db
      .from('participant_missions')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', assignmentId)
      .eq('participant_id', participantId)
      .select('*, missions(*)')
      .maybeSingle();
    if (error) throw new Error(`setMissionCompleted: ${error.message}`);
    return data ? mapAssigned(data) : null;
  }

  async missionProgress(eventId: string): Promise<MissionProgress[]> {
    const participants = await this.listParticipants(eventId);
    if (participants.length === 0) return [];
    const { data, error } = await this.db
      .from('participant_missions')
      .select('participant_id, completed, missions(kind)')
      .in(
        'participant_id',
        participants.map((p) => p.id),
      );
    const rows = unwrap(data, error, 'missionProgress');
    return participants.map((p) => {
      const list = rows.filter((r: Row) => r.participant_id === p.id && r.missions?.kind === 'GENERAL');
      return {
        participantId: p.id,
        completed: list.filter((r: Row) => r.completed).length,
        total: list.length,
      };
    });
  }

  /* ------------- notifications ------------ */

  async listNotifications(eventId: string): Promise<SpyNotification[]> {
    const { data, error } = await this.db
      .from('notifications')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    return unwrap(data, error, 'listNotifications').map(mapNotification);
  }

  async createNotification(input: NotificationInput): Promise<SpyNotification> {
    const { data, error } = await this.db
      .from('notifications')
      .insert({
        event_id: input.eventId,
        title: input.title,
        body: input.body,
        kind: input.kind,
      })
      .select('*')
      .single();
    return mapNotification(unwrap(data, error, 'createNotification'));
  }

  /* ----------------- votes ---------------- */

  async getVoteByVoter(eventId: string, voterId: string): Promise<Vote | null> {
    const { data, error } = await this.db
      .from('votes')
      .select('*')
      .eq('event_id', eventId)
      .eq('voter_participant_id', voterId)
      .maybeSingle();
    if (error) throw new Error(`getVoteByVoter: ${error.message}`);
    return data ? mapVote(data) : null;
  }

  async listVotes(eventId: string): Promise<Vote[]> {
    const { data, error } = await this.db.from('votes').select('*').eq('event_id', eventId);
    return unwrap(data, error, 'listVotes').map(mapVote);
  }

  async insertVote(eventId: string, voterId: string, targetId: string): Promise<Vote> {
    const { data, error } = await this.db
      .from('votes')
      .insert({
        event_id: eventId,
        voter_participant_id: voterId,
        target_participant_id: targetId,
      })
      .select('*')
      .single();
    if (error) {
      // UNIQUE 制約 / CHECK 制約違反をドメインエラーへ変換
      if (error.code === '23505') throw new Error('ALREADY_VOTED');
      if (error.code === '23514') throw new Error('SELF_VOTE_FORBIDDEN');
      throw new Error(`insertVote: ${error.message}`);
    }
    return mapVote(unwrap(data, null, 'insertVote'));
  }

  /* ------------- push 通知 ---------------- */

  async savePushSubscription(input: {
    eventId: string;
    participantId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<void> {
    const { error } = await this.db.from('push_subscriptions').upsert(
      {
        event_id: input.eventId,
        participant_id: input.participantId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new Error(`savePushSubscription: ${error.message}`);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    const { error } = await this.db.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw new Error(`deletePushSubscription: ${error.message}`);
  }

  async listPushSubscriptions(eventId: string): Promise<PushSubscriptionRecord[]> {
    const { data, error } = await this.db
      .from('push_subscriptions')
      .select('*')
      .eq('event_id', eventId);
    return unwrap(data, error, 'listPushSubscriptions').map((r: Row) => ({
      id: r.id,
      eventId: r.event_id,
      participantId: r.participant_id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
      createdAt: r.created_at,
    }));
  }

  /* ----------------- admin ---------------- */

  async isEventAdmin(eventId: string, adminId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('event_admins')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', adminId)
      .maybeSingle();
    if (error) throw new Error(`isEventAdmin: ${error.message}`);
    return Boolean(data);
  }
}
