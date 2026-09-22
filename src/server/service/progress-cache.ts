import type { MissionProgress } from '@/server/repo/types';
import { getRepo } from '@/server/repo';

/**
 * 全員ぶんのMISSION達成状況を、数秒だけ使い回す。
 *
 * この集計はイベント全体で一番重い問い合わせで、101人 × 8件＝800行を読む。
 * それを運営のダッシュボード（5秒ごと）・参加者一覧（6秒ごと）・
 * ランキング（参加者が各自20秒ごと）が別々に呼んでいたため、
 * 同じ集計が1秒間に何度も走っていた。
 *
 * 数秒古くても困らない数字だけをここに通す。
 * 出欠・役割・パスワードなど「押した直後に反映されてほしい」ものは
 * ここを通さず、毎回そのまま読む。
 */

/** 何秒まで使い回すか。達成数の表示が最大この秒数だけ遅れる */
const TTL_MS = 3000;

interface Entry {
  at: number;
  rows: MissionProgress[];
}

const cache = new Map<string, Entry>();
/** 同じ瞬間に来た問い合わせをまとめる（1件だけ実際に走らせる） */
const inFlight = new Map<string, Promise<MissionProgress[]>>();

/** テスト用。キャッシュを持ち越さない */
export function clearProgressCache(): void {
  cache.clear();
  inFlight.clear();
}

export async function cachedMissionProgress(
  eventId: string,
  now: number = Date.now(),
): Promise<MissionProgress[]> {
  const hit = cache.get(eventId);
  if (hit && now - hit.at < TTL_MS) return hit.rows;

  // 期限切れの瞬間に何台も同時に来ると、同じ集計が並んで走る。
  // 走っているものがあれば、その結果を一緒に待つ
  const running = inFlight.get(eventId);
  if (running) return running;

  const promise = getRepo()
    .missionProgress(eventId)
    .then((rows) => {
      cache.set(eventId, { at: now, rows });
      return rows;
    })
    .finally(() => {
      inFlight.delete(eventId);
    });

  inFlight.set(eventId, promise);
  return promise;
}
