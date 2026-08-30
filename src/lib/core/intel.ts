import type { AssignedMission, GamePhase } from '@/lib/types';
import { isSpyMissionPublic } from './phase';

export interface SpyIntelInput {
  phase: GamePhase;
  /** 閲覧者自身がSPYかどうか */
  isSpy: boolean;
  /** SPY本人に割り当てられたSPY MISSION（本人以外には渡さない） */
  ownSpyMissions: AssignedMission[];
  /** 公開フェーズで全員に見せるSPY MISSIONの内容 */
  publicSpyMissions: AssignedMission[];
}

/**
 * 閲覧者に見せてよい SPY MISSION を決定する。
 *  - SPY本人  : 常に自分のSPY MISSIONを見られる
 *  - 一般参加者: 公開フェーズ以降のみ内容を見られる（誰がSPYかは分からない）
 */
export function visibleSpyMissions(input: SpyIntelInput): AssignedMission[] | null {
  if (input.isSpy) return input.ownSpyMissions;
  if (isSpyMissionPublic(input.phase)) return input.publicSpyMissions;
  return null;
}
