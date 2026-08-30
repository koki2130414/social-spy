import type { Mission } from '@/lib/types';
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
