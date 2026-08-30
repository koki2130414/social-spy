import type {
  Mission,
  Participant,
  ParticipantMission,
  SpyEvent,
  SpyNotification,
  Vote,
  PhaseHistoryEntry,
} from '@/lib/types';
import { createRng, shuffle } from '@/lib/core/random';
import { pickMissionsForParticipant, pickSpyMissions } from '@/lib/core/missions';
import { GENERAL_MISSION_PRESETS, SPY_MISSION_PRESETS } from '@/lib/core/mission-presets';

export const DEMO_EVENT_ID = 'ev-demo-0000-0000-0000-000000000001';
export const DEMO_EVENT_CODE = 'SPY2026';
export const DEMO_ADMIN_ID = 'ad-demo-0000-0000-0000-000000000001';

/** デモで「一般参加者として確認」した時の本人 */
export const DEMO_AGENT_PARTICIPANT_ID = 'pt-demo-0000-0000-0000-000000000001';
/** デモで「SPYとして確認」した時の本人 */
export const DEMO_SPY_PARTICIPANT_ID = 'pt-demo-0000-0000-0000-000000000002';

const BASE_TIME = new Date('2026-09-12T10:00:00.000Z');
const iso = (offsetMinutes = 0) =>
  new Date(BASE_TIME.getTime() + offsetMinutes * 60_000).toISOString();

/**
 * MISSION の文言は lib/core/mission-presets.ts に一本化している。
 * デモ用シードと、管理画面からの新規イベント作成が同じ定義を使うため。
 */
export const GENERAL_MISSION_SEEDS = GENERAL_MISSION_PRESETS;
export const SPY_MISSION_SEEDS = SPY_MISSION_PRESETS;

const PARTICIPANT_SEEDS: Array<{ name: string; affiliation: string; spy?: boolean }> = [
  { name: '佐藤 悠真', affiliation: 'フリーランス / Webデザイナー' },
  { name: '鈴木 玲奈', affiliation: 'スタートアップ / 広報', spy: true },
  { name: '高橋 大地', affiliation: '設計事務所 / 建築士' },
  { name: '田中 美咲', affiliation: 'カフェ経営' },
  { name: '伊藤 陽介', affiliation: 'IT企業 / バックエンドエンジニア' },
  { name: '渡辺 千尋', affiliation: '大学院生 / 社会学' },
  { name: '山本 蒼', affiliation: '映像制作会社 / ディレクター' },
  { name: '中村 果歩', affiliation: 'メーカー / 人事・採用' },
  { name: '小林 直樹', affiliation: '地域おこし協力隊', spy: true },
  { name: '加藤 律', affiliation: 'イラストレーター' },
  { name: '吉田 なぎさ', affiliation: '病院 / 管理栄養士' },
  { name: '山田 拓海', affiliation: 'SaaS企業 / 営業' },
];

export interface DemoDataset {
  events: SpyEvent[];
  participants: Participant[];
  missions: Mission[];
  participantMissions: ParticipantMission[];
  notifications: SpyNotification[];
  votes: Vote[];
  phaseHistory: PhaseHistoryEntry[];
}

function participantId(index: number): string {
  return `pt-demo-0000-0000-0000-${String(index + 1).padStart(12, '0')}`;
}

function missionId(kind: 'gm' | 'sm', index: number): string {
  return `ms-demo-${kind}00-0000-0000-${String(index + 1).padStart(12, '0')}`;
}

/**
 * デモ用の固定データセットを生成する。
 * 乱数は seed 固定なので、リセットしても同じ配布結果になる。
 */
export function buildDemoDataset(): DemoDataset {
  const rng = createRng(20260912);

  const event: SpyEvent = {
    id: DEMO_EVENT_ID,
    name: 'CROSS TALK NIGHT vol.7',
    code: DEMO_EVENT_CODE,
    startsAt: iso(0),
    durationMinutes: 90,
    spyRevealOffsetMinutes: 45,
    spyCount: 2,
    registrationOpen: true,
    phase: 'LOBBY',
    phaseChangedAt: iso(-30),
    activeStartedAt: null,
    createdAt: iso(-1440),
    updatedAt: iso(-30),
  };

  const missions: Mission[] = [
    ...GENERAL_MISSION_SEEDS.map((m, i) => ({
      id: missionId('gm', i),
      eventId: DEMO_EVENT_ID,
      code: m.code,
      title: m.title,
      body: m.body,
      kind: 'GENERAL' as const,
      active: true,
      createdAt: iso(-1440),
      updatedAt: iso(-1440),
    })),
    ...SPY_MISSION_SEEDS.map((m, i) => ({
      id: missionId('sm', i),
      eventId: DEMO_EVENT_ID,
      code: m.code,
      title: m.title,
      body: m.body,
      kind: 'SPY' as const,
      active: true,
      createdAt: iso(-1440),
      updatedAt: iso(-1440),
    })),
  ];

  const participants: Participant[] = PARTICIPANT_SEEDS.map((p, i) => ({
    id: participantId(i),
    eventId: DEMO_EVENT_ID,
    displayName: p.name,
    affiliation: p.affiliation,
    role: p.spy ? ('SPY' as const) : ('AGENT' as const),
    loginId: null,
    joinedAt: iso(-25 + i),
    createdAt: iso(-25 + i),
    updatedAt: iso(-25 + i),
  }));

  const participantMissions: ParticipantMission[] = [];
  let assignmentSeq = 0;
  for (const p of participants) {
    const general = pickMissionsForParticipant(missions, { rng });
    for (const a of general) {
      participantMissions.push({
        id: `pm-demo-${String(++assignmentSeq).padStart(6, '0')}`,
        participantId: p.id,
        missionId: a.missionId,
        orderIndex: a.orderIndex,
        completed: false,
        completedAt: null,
      });
    }
    if (p.role === 'SPY') {
      for (const a of pickSpyMissions(missions)) {
        participantMissions.push({
          id: `pm-demo-${String(++assignmentSeq).padStart(6, '0')}`,
          participantId: p.id,
          missionId: a.missionId,
          orderIndex: a.orderIndex,
          completed: false,
          completedAt: null,
        });
      }
    }
  }

  const notifications: SpyNotification[] = [
    {
      id: 'nt-demo-000001',
      eventId: DEMO_EVENT_ID,
      title: 'BRIEFING',
      body: 'ようこそ、情報員諸君。各自のMISSIONを確認し、開始の合図を待て。',
      kind: 'INFO',
      createdAt: iso(-20),
    },
    {
      id: 'nt-demo-000002',
      eventId: DEMO_EVENT_ID,
      title: 'CLASSIFIED INFORMATION',
      body: 'この会場には、諸君に紛れて秘密の任務を帯びたSPYが存在する。',
      kind: 'CLASSIFIED',
      createdAt: iso(-10),
    },
  ];

  const phaseHistory: PhaseHistoryEntry[] = [
    {
      id: 'ph-demo-000001',
      eventId: DEMO_EVENT_ID,
      fromPhase: null,
      toPhase: 'LOBBY',
      changedBy: DEMO_ADMIN_ID,
      changedAt: iso(-30),
    },
  ];

  return {
    events: [event],
    participants,
    missions,
    participantMissions,
    notifications,
    votes: [],
    phaseHistory,
  };
}

/**
 * VOTING に入った時点で、まだ投票していないNPC参加者のサンプル投票を作る。
 * （デモを触った人がすぐ結果画面を確認できるようにするため）
 */
export function buildSampleVotes(
  participants: readonly Participant[],
  existingVotes: readonly Vote[],
  excludeVoterIds: readonly string[],
): Vote[] {
  const rng = createRng(778899);
  const voted = new Set(existingVotes.map((v) => v.voterParticipantId));
  const excluded = new Set(excludeVoterIds);
  const spies = participants.filter((p) => p.role === 'SPY');
  const out: Vote[] = [];
  let seq = existingVotes.length;

  for (const voter of participants) {
    if (voted.has(voter.id) || excluded.has(voter.id)) continue;
    const others = participants.filter((p) => p.id !== voter.id);
    if (others.length === 0) continue;
    // 4割程度はSPYを正しく当てる、残りはランダム
    const pickSpy = rng() < 0.4 && spies.some((s) => s.id !== voter.id);
    const pool = pickSpy ? spies.filter((s) => s.id !== voter.id) : others;
    const target = shuffle(pool, rng)[0];
    out.push({
      id: `vt-demo-${String(++seq).padStart(6, '0')}`,
      eventId: voter.eventId,
      voterParticipantId: voter.id,
      targetParticipantId: target.id,
      createdAt: new Date().toISOString(),
    });
  }
  return out;
}
