import type { Participant, PublicParticipant } from '@/lib/types';
import { shuffle, type Rng } from './random';

/**
 * 参加者情報から role を確実に取り除く。
 * 参加者向けのレスポンスは必ずこの関数を通す。
 */
export function toPublicParticipant(p: Participant): PublicParticipant {
  return {
    id: p.id,
    eventId: p.eventId,
    displayName: p.displayName,
    affiliation: p.affiliation,
    joinedAt: p.joinedAt,
  };
}

export function toPublicParticipants(list: readonly Participant[]): PublicParticipant[] {
  return list.map(toPublicParticipant);
}

/** 当日その場にいる人だけを取り出す。欠席にした人はあらゆる抽選・集計から外す */
export function attendingOnly(participants: readonly Participant[]): Participant[] {
  return participants.filter((p) => p.attending);
}

/**
 * SPY を自動選出する。既存の役割はすべてリセットしたうえで count 名を選ぶ。
 *
 * 欠席にした人はここで必ず除外する。SPY はゲーム開始の瞬間に選ばれるため、
 * 除外しないと「SPYが当日来ていない人だった」という取り返しのつかない
 * 事故になる（その分だけSPYが減り、参加者はいない人を探し続ける）。
 */
export function selectSpies(
  participants: readonly Participant[],
  count: number,
  rng?: Rng,
): { spyIds: string[]; agentIds: string[] } {
  const pool = attendingOnly(participants);
  const safeCount = Math.max(0, Math.min(count, pool.length));
  const shuffled = shuffle(pool, rng);
  const spyIds = shuffled.slice(0, safeCount).map((p) => p.id);
  const spySet = new Set(spyIds);
  // 欠席者は spyIds にも agentIds にも入らない。
  // （役割の書き込み側は spyIds に無い人を AGENT にするので、
  //   もし欠席者が前回SPYだった場合もここで AGENT に戻る）
  const agentIds = pool.filter((p) => !spySet.has(p.id)).map((p) => p.id);
  return { spyIds, agentIds };
}

export function spiesOf(participants: readonly Participant[]): Participant[] {
  return participants.filter((p) => p.role === 'SPY' && p.attending);
}
