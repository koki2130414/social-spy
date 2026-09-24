import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * 参加者画面の問い合わせ間隔。
 *
 * 会場では100人以上が同時に開く。1人あたりの間隔がそのまま人数倍で
 * サーバーと会場の回線にかかるため、ここは負荷に直結する。
 *
 * ゲームの大半の時間は何も動かないので、変化が無いあいだは
 * 間隔を広げる。変化があれば元に戻す（気づくのが遅れないように）。
 */

const apiGetRevalidate = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiGetRevalidate: (...args: unknown[]) => apiGetRevalidate(...args),
  };
});
vi.mock('./use-realtime', () => ({ useRealtimeEvent: () => undefined }));

import { useGameState } from './use-game-state';

/** document.hidden を差し替える */
function setHidden(hidden: boolean) {
  return vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
}

const unchanged = { data: { event: { id: 'ev1' } }, changed: false };
const changed = { data: { event: { id: 'ev1' } }, changed: true };

describe('useGameState の問い合わせ', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGetRevalidate.mockReset();
    apiGetRevalidate.mockResolvedValue(changed);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('画面が消えている間は問い合わせない', async () => {
    const hidden = setHidden(true);
    renderHook(() => useGameState());
    await act(async () => {});
    const afterMount = apiGetRevalidate.mock.calls.length; // 初回の1回だけ

    await act(async () => {
      vi.advanceTimersByTime(120000); // 2分ぶん
    });

    expect(apiGetRevalidate.mock.calls.length).toBe(afterMount);
    hidden.mockRestore();
  });

  it('戻ってきたらすぐ最新に追いつく', async () => {
    const hidden = setHidden(true);
    renderHook(() => useGameState());
    await act(async () => {});
    const before = apiGetRevalidate.mock.calls.length;

    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(apiGetRevalidate.mock.calls.length).toBe(before + 1);
  });

  it('動きがあるときでも、1分あたり10回を超えない', async () => {
    setHidden(false);
    renderHook(() => useGameState());
    await act(async () => {});
    apiGetRevalidate.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    // 100人が同時に開くことを想定した上限。4秒間隔なら15回で超える
    expect(apiGetRevalidate.mock.calls.length).toBeLessThanOrEqual(10);
    expect(apiGetRevalidate.mock.calls.length).toBeGreaterThan(0);
  });

  it('何も変わらない間は、問い合わせの回数が減る', async () => {
    setHidden(false);

    // 毎回「変わった」と答える場合
    apiGetRevalidate.mockResolvedValue(changed);
    const busy = renderHook(() => useGameState());
    await act(async () => {});
    apiGetRevalidate.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(180000); // 3分ぶん
    });
    const busyCalls = apiGetRevalidate.mock.calls.length;
    busy.unmount();

    // 毎回「変わっていない」と答える場合
    apiGetRevalidate.mockReset();
    apiGetRevalidate.mockResolvedValue(unchanged);
    const quiet = renderHook(() => useGameState());
    await act(async () => {});
    apiGetRevalidate.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(180000);
    });
    const quietCalls = apiGetRevalidate.mock.calls.length;
    quiet.unmount();

    // 何も動かない3分では、はっきり減っていること
    expect(quietCalls).toBeLessThan(busyCalls);
    expect(quietCalls).toBeLessThanOrEqual(Math.ceil(busyCalls * 0.7));
  });

  it('間隔が広がっていても、上限（30秒）を超えて空かない', async () => {
    setHidden(false);
    apiGetRevalidate.mockResolvedValue(unchanged);
    renderHook(() => useGameState());
    await act(async () => {});
    apiGetRevalidate.mockClear();

    // 十分に広がりきった状態から、さらに1分待つ
    await act(async () => {
      vi.advanceTimersByTime(300000);
    });
    apiGetRevalidate.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    // 上限30秒＋ばらつき20% なら、1分で1回は必ず来る
    expect(apiGetRevalidate.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
