import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * 参加者画面の問い合わせ間隔。
 *
 * 会場では数十人が同時に開く。1人あたりの間隔がそのまま人数倍で
 * サーバーと会場の回線にかかるため、ここは負荷に直結する。
 */

const apiGet = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) };
});
vi.mock('./use-realtime', () => ({ useRealtimeEvent: () => undefined }));

import { useGameState } from './use-game-state';

/** document.hidden を差し替える */
function setHidden(hidden: boolean) {
  return vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
}

describe('useGameState の問い合わせ', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset();
    apiGet.mockResolvedValue({ event: { id: 'ev1' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('画面が消えている間は問い合わせない', async () => {
    const hidden = setHidden(true);
    renderHook(() => useGameState());
    await act(async () => {});
    const afterMount = apiGet.mock.calls.length; // 初回の1回だけ

    await act(async () => {
      vi.advanceTimersByTime(120000); // 2分ぶん
    });

    expect(apiGet.mock.calls.length).toBe(afterMount);
    hidden.mockRestore();
  });

  it('戻ってきたらすぐ最新に追いつく', async () => {
    const hidden = setHidden(true);
    renderHook(() => useGameState());
    await act(async () => {});
    const before = apiGet.mock.calls.length;

    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(apiGet.mock.calls.length).toBe(before + 1);
  });

  it('開いている間は1分あたり10回を超えない', async () => {
    setHidden(false);
    renderHook(() => useGameState());
    await act(async () => {});
    apiGet.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    // 100人が同時に開くことを想定した上限。4秒間隔なら15回で超える
    expect(apiGet.mock.calls.length).toBeLessThanOrEqual(10);
    expect(apiGet.mock.calls.length).toBeGreaterThan(0);
  });
});
