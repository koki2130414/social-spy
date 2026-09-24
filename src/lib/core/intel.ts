import type { AssignedMission } from '@/lib/types';

export interface SpyIntelInput {
  /**
   * 全員に見せてよい段階か。
   * フェーズだけでなくイベントの設定（公開する／しない）も含めた結論を渡す。
   */
  shared: boolean;
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
 *  - 一般参加者: 公開してよい段階のときだけ内容を見られる（誰がSPYかは分からない）
 */
export function visibleSpyMissions(input: SpyIntelInput): AssignedMission[] | null {
  if (input.isSpy) return input.ownSpyMissions;
  if (input.shared) return input.publicSpyMissions;
  return null;
}
