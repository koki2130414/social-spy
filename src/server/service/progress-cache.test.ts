import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 一番重い集計（全員ぶんのMISSION達成状況）を共有して、
 * 同じ計算が1秒間に何度も走らないようにする。
 *
 * 守りたいのは次の3つ。
 *  ・数秒のあいだは使い回すこと
 *  ・同じ瞬間に何台も来ても、実際に走る集計は1回にまとめること
 *  ・数秒たてば新しい値に入れ替わること（ずっと古いままにしない）
 */

let calls = 0;
let resolveNext: ((rows: unknown[]) => void) | null = null;
let rowsToReturn: unknown[] = [];

vi.mock('@/server/repo', () => ({
  getRepo: () => ({
    missionProgress: () => {
      calls += 1;
      if (resolveNext) {
        return new Promise((resolve) => {
          resolveNext = resolve as (rows: unknown[]) => void;
        });
      }
      return Promise.resolve(rowsToReturn);
    },
  }),
}));

import { cachedMissionProgress, clearProgressCache } from './progress-cache';

const EVENT = 'ev-1';

describe('重い集計の共有', () => {
  beforeEach(() => {
    calls = 0;
    resolveNext = null;
    rowsToReturn = [{ participantId: 'p1', completed: 1, total: 8 }];
    clearProgressCache();
  });

  it('数秒のあいだは使い回す（3画面から呼んでも集計は1回）', async () => {
    const t = 1_000_000;
    await cachedMissionProgress(EVENT, t); // 運営ダッシュボード
    await cachedMissionProgress(EVENT, t + 500); // 参加者一覧
    await cachedMissionProgress(EVENT, t + 2000); // ランキング

    expect(calls).toBe(1);
  });

  it('数秒たてば新しい値に入れ替わる', async () => {
    const t = 2_000_000;
    await cachedMissionProgress(EVENT, t);
    rowsToReturn = [{ participantId: 'p1', completed: 5, total: 8 }];
    const later = await cachedMissionProgress(EVENT, t + 3500);

    expect(calls).toBe(2);
    expect(later).toEqual([{ participantId: 'p1', completed: 5, total: 8 }]);
  });

  it('同じ瞬間に何台も来ても、集計は1回にまとめる', async () => {
    const t = 3_000_000;
    // 1件目は終わらせずに保留にして、その間に後続を重ねる
    resolveNext = () => {};
    const first = cachedMissionProgress(EVENT, t);
    const second = cachedMissionProgress(EVENT, t);
    const third = cachedMissionProgress(EVENT, t);

    resolveNext?.([{ participantId: 'p1', completed: 2, total: 8 }]);
    const [a, b, c] = await Promise.all([first, second, third]);

    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('イベントが違えば混ざらない', async () => {
    const t = 4_000_000;
    await cachedMissionProgress(EVENT, t);
    await cachedMissionProgress('ev-2', t);
    expect(calls).toBe(2);
  });
});
