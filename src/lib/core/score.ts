import type { MissionProgress, Participant, RankingRow } from '@/lib/types';

/**
 * クエストの達成率とランキング。
 *
 * 点数ではなく「配られたクエストのうち何％を達成したか」で見る。
 * SPY は一般クエスト3件に加えて SPY MISSION 3件を持つため、
 * 達成数そのものを比べると不公平になるが、割合なら横並びで比べられる。
 *
 * --- SPY が漏れないようにするための約束 ---
 *
 * 正体公開前のランキングに SPY MISSION を含めてはならない。
 * 含めると、SPY MISSION が公開された瞬間に SPY だけ分母が 3 から 6 に増え、
 * 12人の達成率が同時に落ちる。ランキングを眺めているだけで誰が SPY か分かる。
 *
 * そのため includeSpyMissions は、正体公開後の結果発表でのみ true にする。
 * 判定は呼び出し側ではなくフェーズから決めること（buildRanking を使う）。
 */

/** 0〜100 の整数。分母が 0 のときは 0 とする（0除算を避ける） */
export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  const raw = (completed / total) * 100;
  // 100%でないのに丸めて100%に見えると「全部やったのに1位じゃない」と混乱するので、
  // 達成しきっていない場合は 99% で止める。
  if (completed < total) return Math.min(99, Math.round(raw));
  return 100;
}

export interface RankingOptions {
  /** SPY MISSION を達成率に含めるか。正体公開後のみ true */
  includeSpyMissions: boolean;
}

/**
 * 達成率の高い順に並べる。
 *
 *  - 欠席にした人は出さない（当日いない人が上位に並ばないように）
 *  - 達成率が同じなら「早く達成した人」が上
 *  - 順位は達成率で決まるので、同率なら同じ順位になる（1位が複数いてよい）
 */
export function computeRanking(
  participants: readonly Participant[],
  progress: readonly MissionProgress[],
  options: RankingOptions,
): RankingRow[] {
  const byId = new Map(progress.map((p) => [p.participantId, p]));

  const rows = participants
    .filter((p) => p.attending)
    .map((p) => {
      const pr = byId.get(p.id);
      const completed =
        (pr?.completed ?? 0) + (options.includeSpyMissions ? (pr?.spyCompleted ?? 0) : 0);
      const total = (pr?.total ?? 0) + (options.includeSpyMissions ? (pr?.spyTotal ?? 0) : 0);
      const times = [pr?.lastCompletedAt ?? null];
      if (options.includeSpyMissions) times.push(pr?.lastSpyCompletedAt ?? null);
      const lastCompletedAt =
        times
          .filter((t): t is string => t !== null)
          .sort()
          .at(-1) ?? null;

      return {
        rank: 0,
        participantId: p.id,
        displayName: p.displayName,
        affiliation: p.affiliation,
        completed,
        total,
        percent: completionPercent(completed, total),
        lastCompletedAt,
      };
    });

  rows.sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    // 同率なら早く達成した人が上。まだ1件も達成していない人は後ろへ
    if (a.lastCompletedAt !== b.lastCompletedAt) {
      if (a.lastCompletedAt === null) return 1;
      if (b.lastCompletedAt === null) return -1;
      return a.lastCompletedAt.localeCompare(b.lastCompletedAt);
    }
    return a.displayName.localeCompare(b.displayName, 'ja');
  });

  // 達成率が同じ人は同じ順位（1位が3人いたら次は4位）
  let rank = 0;
  let previousPercent: number | null = null;
  rows.forEach((row, index) => {
    if (row.percent !== previousPercent) {
      rank = index + 1;
      previousPercent = row.percent;
    }
    row.rank = rank;
  });

  return rows;
}

/** イベント全体の達成率（達成した件数 ÷ 配った件数） */
export function overallPercent(rows: readonly RankingRow[]): number {
  const completed = rows.reduce((sum, r) => sum + r.completed, 0);
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return completionPercent(completed, total);
}
