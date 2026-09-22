import type { Participant, RankingRow, Vote } from '@/lib/types';

/**
 * 最後の総合順位。
 *
 * クエストの達成率と、SPYを何人当てたかを1本の順位にまとめる。
 *
 * 点数の決め方（運営の指定）
 *   ・クエスト達成率 100% ＝ 1.00 ポイント（50%なら 0.50）
 *   ・SPYを1人当てるごとに ＋1.00 ポイント
 * SPYは2人いるので、全問達成（1.00）より2人当て（2.00）のほうが上になる。
 * 数字を変えたくなったら、この2つの定数だけを直せばよい。
 *
 * --- SPY が漏れないようにするための約束 ---
 *
 * ここは正体公開後にしか使わない。誰がSPYかを引数に取るため、
 * 公開前の画面から呼ぶとその一覧が漏れる。呼び出し側（service）で
 * フェーズを確認すること。
 */

/** 達成率100%ぶんのポイント */
export const POINT_FOR_FULL_QUEST = 1;
/** SPYを1人当てたときのポイント */
export const POINT_PER_CORRECT_SPY = 1;

export interface FinalRankingRow {
  /** 同じ点数の人は同じ順位（1位が複数いてよい） */
  rank: number;
  participantId: string;
  displayName: string;
  affiliation: string | null;
  /** 0〜100 の整数 */
  percent: number;
  /** この人が選んだ中で、本当にSPYだった人数 */
  correctSpies: number;
  /** この人が選んだ人数（当たり外れの母数） */
  picked: number;
  /** 合計ポイント。小数第2位まで */
  points: number;
  /** 最後にクエストを達成した時刻。同点のときの並び順に使う */
  lastCompletedAt: string | null;
}

/** 選んだ相手のうち、本当にSPYだった人数を投票者ごとに数える */
export function countCorrectSpies(
  votes: readonly Vote[],
  spyIds: ReadonlySet<string>,
): Map<string, { correct: number; picked: number }> {
  const byVoter = new Map<string, { correct: number; picked: number }>();
  for (const v of votes) {
    const entry = byVoter.get(v.voterParticipantId) ?? { correct: 0, picked: 0 };
    entry.picked += 1;
    if (spyIds.has(v.targetParticipantId)) entry.correct += 1;
    byVoter.set(v.voterParticipantId, entry);
  }
  return byVoter;
}

/**
 * 達成率ランキングと投票から、総合順位を作る。
 *
 * 欠席の人は出さない（ランキング側ですでに除かれている）。
 * 投票した相手が欠席だった場合は、その票を数えない。
 */
export function computeFinalRanking(
  ranking: readonly RankingRow[],
  participants: readonly Participant[],
  votes: readonly Vote[],
): FinalRankingRow[] {
  const present = participants.filter((p) => p.attending);
  const presentIds = new Set(present.map((p) => p.id));
  const spyIds = new Set(present.filter((p) => p.role === 'SPY').map((p) => p.id));

  // 欠席の人が関わる票は、当たりにも外れにも数えない
  const counted = votes.filter(
    (v) => presentIds.has(v.voterParticipantId) && presentIds.has(v.targetParticipantId),
  );
  const byVoter = countCorrectSpies(counted, spyIds);

  const rows: FinalRankingRow[] = ranking.map((r) => {
    const hit = byVoter.get(r.participantId) ?? { correct: 0, picked: 0 };
    const points = (r.percent / 100) * POINT_FOR_FULL_QUEST + hit.correct * POINT_PER_CORRECT_SPY;
    return {
      rank: 0,
      participantId: r.participantId,
      displayName: r.displayName,
      affiliation: r.affiliation,
      percent: r.percent,
      correctSpies: hit.correct,
      picked: hit.picked,
      // 0.30000000000000004 のような見え方を避けるため、小数第2位で止める
      points: Math.round(points * 100) / 100,
      lastCompletedAt: r.lastCompletedAt,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // 同点なら、SPYを多く当てた人が上
    if (b.correctSpies !== a.correctSpies) return b.correctSpies - a.correctSpies;
    // それも同じなら、早くクエストを終えた人が上。1件も達成していない人は後ろへ
    if (a.lastCompletedAt !== b.lastCompletedAt) {
      if (a.lastCompletedAt === null) return 1;
      if (b.lastCompletedAt === null) return -1;
      return a.lastCompletedAt.localeCompare(b.lastCompletedAt);
    }
    return a.displayName.localeCompare(b.displayName, 'ja');
  });

  let rank = 0;
  let previous: number | null = null;
  rows.forEach((row, index) => {
    if (row.points !== previous) {
      rank = index + 1;
      previous = row.points;
    }
    row.rank = rank;
  });

  return rows;
}
