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

/** SPY を自動選出する。既存の役割はすべてリセットしたうえで count 名を選ぶ */
export function selectSpies(
  participants: readonly Participant[],
  count: number,
  rng?: Rng,
): { spyIds: string[]; agentIds: string[] } {
  const safeCount = Math.max(0, Math.min(count, participants.length));
  const shuffled = shuffle(participants, rng);
  const spyIds = shuffled.slice(0, safeCount).map((p) => p.id);
  const spySet = new Set(spyIds);
  const agentIds = participants.filter((p) => !spySet.has(p.id)).map((p) => p.id);
  return { spyIds, agentIds };
}

export function spiesOf(participants: readonly Participant[]): Participant[] {
  return participants.filter((p) => p.role === 'SPY');
}
