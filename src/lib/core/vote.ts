import type { GamePhase, Participant, Vote, GameResult, VoteResultRow } from '@/lib/types';
import { canVoteInPhase } from './phase';
import { toPublicParticipant } from './spy';

export type VoteRejection =
  | 'PHASE_NOT_VOTING'
  | 'SELF_VOTE_FORBIDDEN'
  | 'ALREADY_VOTED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_OTHER_EVENT'
  | 'TARGET_NOT_ATTENDING'
  | 'VOTER_NOT_ATTENDING'
  | 'NO_TARGET_SELECTED'
  | 'TOO_MANY_TARGETS';

/**
 * 1人が選べる人数の上限。
 *
 * 上限が無いと「全員を選べば全員正解」になり、勘が働いた人と差がつかない。
 * 10人までなら、101人の中から絞り込む意味が残る。
 * 画面・サーバー・データベースの3か所で同じ数を守る。
 */
export const MAX_VOTE_TARGETS = 10;

export const VOTE_REJECTION_MESSAGE: Record<VoteRejection, string> = {
  PHASE_NOT_VOTING: '現在は投票を受け付けていません。',
  SELF_VOTE_FORBIDDEN: '自分自身には投票できません。',
  ALREADY_VOTED: 'すでに投票済みです。投票内容は変更できません。',
  TARGET_NOT_FOUND: '選択した参加者が見つかりません。',
  TARGET_OTHER_EVENT: '同じイベントの参加者にのみ投票できます。',
  TARGET_NOT_ATTENDING: 'その参加者は欠席として登録されています。',
  VOTER_NOT_ATTENDING: '欠席として登録されているため投票できません。運営にお声がけください。',
  NO_TARGET_SELECTED: 'SPYだと思う人を1人以上選んでください。',
  TOO_MANY_TARGETS: `選べるのは${MAX_VOTE_TARGETS}人までです。`,
};

export interface VoteValidationInput {
  phase: GamePhase;
  voterId: string;
  /** 選んだ相手。重複は呼び出し前に取り除いておく */
  targetIds: readonly string[];
  eventId: string;
  /** すでに投票済みなら、その票（1件でもあれば投票済みとみなす） */
  existingVote: Vote | null;
  /** 選ばれた相手の情報。見つからなかった相手は含めない */
  targets: readonly { id: string; eventId: string; attending: boolean }[];
  /** 投票しようとしている本人が当日来ていることになっているか */
  voterAttending: boolean;
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
  if (input.targetIds.length === 0) return { ok: false, reason: 'NO_TARGET_SELECTED' };
  if (input.targetIds.length > MAX_VOTE_TARGETS) return { ok: false, reason: 'TOO_MANY_TARGETS' };
  if (input.targetIds.includes(input.voterId)) return { ok: false, reason: 'SELF_VOTE_FORBIDDEN' };
  if (input.targets.length !== input.targetIds.length) {
    return { ok: false, reason: 'TARGET_NOT_FOUND' };
  }
  if (input.targets.some((t) => t.eventId !== input.eventId)) {
    return { ok: false, reason: 'TARGET_OTHER_EVENT' };
  }
  if (!input.voterAttending) return { ok: false, reason: 'VOTER_NOT_ATTENDING' };
  if (input.targets.some((t) => !t.attending)) {
    return { ok: false, reason: 'TARGET_NOT_ATTENDING' };
  }
  return { ok: true };
}

/**
 * 投票結果の集計。複数SPYに対応。
 *
 * 欠席にした人は結果に出さず、その人が投じた票・その人へ投じられた票も数えない。
 * 当日来ていない人が1位になったり、来ていない人がSPYとして発表されるのを防ぐ。
 */
export function computeResults(
  participants: readonly Participant[],
  votes: readonly Vote[],
): GameResult {
  const present = participants.filter((p) => p.attending);
  const presentIds = new Set(present.map((p) => p.id));

  // 投票者・投票先の両方が出席している票だけを数える
  const countedVotes = votes.filter(
    (v) => presentIds.has(v.voterParticipantId) && presentIds.has(v.targetParticipantId),
  );

  const counts = new Map<string, number>();
  for (const v of countedVotes) {
    counts.set(v.targetParticipantId, (counts.get(v.targetParticipantId) ?? 0) + 1);
  }

  const spies = present.filter((p) => p.role === 'SPY');
  const spyIds = new Set(spies.map((p) => p.id));

  const rows: VoteResultRow[] = present
    .map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      affiliation: p.affiliation,
      votes: counts.get(p.id) ?? 0,
      isSpy: spyIds.has(p.id),
    }))
    .sort((a, b) => b.votes - a.votes || a.displayName.localeCompare(b.displayName, 'ja'));

  // 1人が何人も選べるので「当たった票の数」と「当てた人の数」は別物になる。
  // 表彰で読み上げるのは人数のほうなので、投票者で重複を除く
  const correctVoters = new Set(
    countedVotes.filter((v) => spyIds.has(v.targetParticipantId)).map((v) => v.voterParticipantId),
  ).size;
  const correctBallots = countedVotes.filter((v) => spyIds.has(v.targetParticipantId)).length;

  return {
    spies: spies.map(toPublicParticipant),
    rows,
    totalVotes: countedVotes.length,
    totalParticipants: present.length,
    correctVoters,
    correctBallots,
  };
}
