import type { Mission, MissionKind } from '@/lib/types';
import { shuffle, type Rng } from './random';

/** 1人あたりに配布する一般MISSIONの件数 */
export const MISSIONS_PER_PARTICIPANT = 3;

export interface MissionAssignment {
  missionId: string;
  orderIndex: number;
}

/**
 * 1人の参加者へ配布する MISSION を選ぶ。
 *  - 同一人物へ同じ MISSION を重複配布しない
 *  - 有効(active)な MISSION のみ対象
 *  - 候補が3件に満たない場合は、あるだけ配布する（重複はさせない）
 */
export function pickMissionsForParticipant(
  missions: readonly Mission[],
  options: { count?: number; rng?: Rng; excludeMissionIds?: readonly string[] } = {},
): MissionAssignment[] {
  const { count = MISSIONS_PER_PARTICIPANT, rng, excludeMissionIds = [] } = options;
  const excluded = new Set(excludeMissionIds);
  const pool = missions.filter((m) => m.active && m.kind === 'GENERAL' && !excluded.has(m.id));

  const picked = shuffle(pool, rng).slice(0, count);
  // 念のため重複を除去（不正なデータが混じっても重複配布させない）
  const seen = new Set<string>();
  const unique = picked.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return unique.map((m, i) => ({ missionId: m.id, orderIndex: i + 1 }));
}

/** SPY 本人に配布する SPY MISSION（MVPでは全SPY MISSIONを付与） */
export function pickSpyMissions(missions: readonly Mission[]): MissionAssignment[] {
  return missions
    .filter((m) => m.active && m.kind === 'SPY')
    .map((m, i) => ({ missionId: m.id, orderIndex: i + 1 }));
}

export function countCompleted(list: readonly { completed: boolean }[]): number {
  return list.filter((m) => m.completed).length;
}

/** 一括配布のために組み立てた1行 */
export interface GeneralMissionRow {
  participantId: string;
  missionId: string;
  orderIndex: number;
}

/** 一括配布の入力。どのMISSIONが誰に配られているかだけ分かればよい */
export interface ExistingAssignment {
  participantId: string;
  missionId: string;
  kind: MissionKind;
}

/**
 * 未配布の参加者だけを選び、挿入すべき行をまとめて組み立てる。
 *
 * 参加者ごとにデータベースへ問い合わせると人数分の往復になるため、
 * 判定と抽選はすべてここ（メモリ上）で済ませる。
 * 一般MISSIONを1件でも持っている人は配布済みとみなして飛ばす。
 */
export function buildGeneralMissionRows(
  participants: readonly { id: string }[],
  existing: readonly ExistingAssignment[],
  missions: readonly Mission[],
): GeneralMissionRow[] {
  const byParticipant = new Map<string, ExistingAssignment[]>();
  for (const a of existing) {
    const list = byParticipant.get(a.participantId);
    if (list) list.push(a);
    else byParticipant.set(a.participantId, [a]);
  }

  const rows: GeneralMissionRow[] = [];
  for (const p of participants) {
    const mine = byParticipant.get(p.id) ?? [];
    if (mine.some((a) => a.kind === 'GENERAL')) continue; // 配布済み
    const picks = pickMissionsForParticipant(missions, {
      excludeMissionIds: mine.map((a) => a.missionId),
    });
    for (const pick of picks) {
      rows.push({ participantId: p.id, missionId: pick.missionId, orderIndex: pick.orderIndex });
    }
  }
  return rows;
}
