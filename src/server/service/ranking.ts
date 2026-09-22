import type { GamePhase, RankingRow } from '@/lib/types';
import { isIdentityRevealed } from '@/lib/core/phase';
import { computeRanking } from '@/lib/core/score';
import { getRepo } from '@/server/repo';
import { cachedMissionProgress, clearProgressCache } from './progress-cache';

/**
 * 達成率ランキングの組み立てと、短時間のキャッシュ。
 *
 * --- SPY が漏れないようにするための約束 ---
 *
 * SPY MISSION を達成率へ含めてよいのは正体公開後だけ。
 * 判定をここ1か所に閉じ込め、呼び出し側が true/false を選べないようにしている。
 * 呼び出し側の指定にすると、画面を1つ足したときに指定を間違えて
 * 「SPY MISSION公開の瞬間に12人の達成率だけ落ちる」＝正体バレを起こしうる。
 *
 * --- 100人が同時に見ても重くしないための工夫 ---
 *
 * ランキングは全員分の進捗が要るので、1回あたりの問い合わせが重い。
 * 100人が各自の端末で開くと同じ計算を何度も繰り返すことになるため、
 * イベントごとに数秒だけ結果を使い回す。
 * 数秒古くても困らない画面なので、鮮度より当日の軽さを優先する。
 */

/** 何秒まで使い回すか。短すぎると効果が無く、長すぎると反映が遅く見える */
const CACHE_TTL_MS = 5000;

interface CacheEntry {
  at: number;
  phase: GamePhase;
  rows: RankingRow[];
}

const cache = new Map<string, CacheEntry>();

/** テスト用。キャッシュの状態を持ち越さないようにする（元にした集計も一緒に捨てる） */
export function clearRankingCache(): void {
  cache.clear();
  clearProgressCache();
}

/**
 * イベントの達成率ランキングを返す。
 *
 * SPY MISSION を含めるかはフェーズだけで決まる（呼び出し側は選べない）。
 */
export async function buildRanking(
  eventId: string,
  phase: GamePhase,
  now: number = Date.now(),
): Promise<RankingRow[]> {
  const cached = cache.get(eventId);
  // フェーズが変わったら作り直す。正体公開の瞬間に古い内容を出さないため
  if (cached && cached.phase === phase && now - cached.at < CACHE_TTL_MS) {
    return cached.rows;
  }

  const repo = getRepo();
  const [participants, progress] = await Promise.all([
    repo.listParticipants(eventId),
    // 重い集計は運営画面とも共有する（同じ集計を何度も走らせない）
    cachedMissionProgress(eventId, now),
  ]);

  const rows = computeRanking(participants, progress, {
    includeSpyMissions: isIdentityRevealed(phase),
  });

  cache.set(eventId, { at: now, phase, rows });
  return rows;
}
