import type { GamePhase, Participant, Vote, GameResult, VoteResultRow } from '@/lib/types';
import { canVoteInPhase } from './phase';
import { toPublicParticipant } from './spy';

export type VoteRejection =
  | 'PHASE_NOT_VOTING'
  | 'SELF_VOTE_FORBIDDEN'
  | 'ALREADY_VOTED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_OTHER_EVENT';

export const VOTE_REJECTION_MESSAGE: Record<VoteRejection, string> = {
  PHASE_NOT_VOTING: '現在は投票を受け付けていません。',
  SELF_VOTE_FORBIDDEN: '自分自身には投票できません。',
  ALREADY_VOTED: 'すでに投票済みです。投票内容は変更できません。',
  TARGET_NOT_FOUND: '選択した参加者が見つかりません。',
  TARGET_OTHER_EVENT: '同じイベントの参加者にのみ投票できます。',
};

export interface VoteValidationInput {
  phase: GamePhase;
  voterId: string;
  targetId: string;
  eventId: string;
  existingVote: Vote | null;
  target: { id: string; eventId: string } | null;
}

export type VoteValidationResult = { ok: true } | { ok: false; reason: VoteRejection };

/**
 * 投票の妥当性検証。
 * フロントエンドだけでなくサーバー側でも必ずこの関数を通す。
 * DB 側にも UNIQUE 制約 / CHECK 制約 / UPDATE 禁止トリガを用意している。
 */
export function validateVote(input: VoteValidationInput): VoteValidationResult {
  if (!canVoteInPhase(input.phase)) return { ok: false, reason: 'PHASE_NOT_VOTING' };
  if (input.existingVote) return { ok: false, reason: 'ALREADY_VOTED' };
  if (input.voterId === input.targetId) return { ok: false, reason: 'SELF_VOTE_FORBIDDEN' };
  if (!input.target) return { ok: false, reason: 'TARGET_NOT_FOUND' };
  if (input.target.eventId !== input.eventId) return { ok: false, reason: 'TARGET_OTHER_EVENT' };
  return { ok: true };
}

/** 投票結果の集計。複数SPYに対応 */
export function computeResults(
  participants: readonly Participant[],
  votes: readonly Vote[],
): GameResult {
  const counts = new Map<string, number>();
  for (const v of votes) {
    counts.set(v.targetParticipantId, (counts.get(v.targetParticipantId) ?? 0) + 1);
  }

  const spyIds = new Set(participants.filter((p) => p.role === 'SPY').map((p) => p.id));

  const rows: VoteResultRow[] = participants
    .map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      affiliation: p.affiliation,
      votes: counts.get(p.id) ?? 0,
      isSpy: spyIds.has(p.id),
    }))
    .sort((a, b) => b.votes - a.votes || a.displayName.localeCompare(b.displayName, 'ja'));

  const correctVoters = votes.filter((v) => spyIds.has(v.targetParticipantId)).length;

  return {
    spies: participants.filter((p) => p.role === 'SPY').map(toPublicParticipant),
    rows,
    totalVotes: votes.length,
    totalParticipants: participants.length,
    correctVoters,
  };
}
