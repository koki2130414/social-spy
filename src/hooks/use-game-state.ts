'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGetRevalidate, ApiError } from '@/lib/api';
import { nextPollDelay, relaxedInterval } from '@/lib/polling';
import type { ParticipantGameState } from '@/lib/types';
import { useRealtimeEvent } from './use-realtime';

/**
 * 保険としての問い合わせ間隔。
 *
 * フェーズ変更とお知らせは Realtime が即座に届けるので、
 * ここは Realtime が届かなかった時の取りこぼし回収でしかない。
 * 会場では全員が同時に開くため、短くするとその人数分の負荷が
 * そのままサーバーと会場の回線にかかる。
 *
 * 何も変わらない間は間隔を広げ、変化があれば base に戻す。
 * ゲームの大半の時間は何も動かないので、これだけで往復が半分近く減る。
 */
const POLL_BASE_MS = 15000;
const POLL_MAX_MS = 30000;

export interface GameStateResult {
  state: ParticipantGameState | null;
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
}

/**
 * 参加者の状態を取得し、フェーズ変更に自動追従する。
 * Supabase 使用時は Realtime、それ以外（デモモード）はポーリングで反映する。
 */
export function useGameState(): GameStateResult {
  const [state, setState] = useState<ParticipantGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);
  /** いまの問い合わせ間隔。変化が無いあいだは広がっていく */
  const intervalRef = useRef(POLL_BASE_MS);

  const refresh = useCallback(async () => {
    try {
      // 前回と同じ内容ならサーバーは本文を返さない（通信量を抑える）
      const { data, changed } =
        await apiGetRevalidate<ParticipantGameState>('/api/participant/state');
      if (!mounted.current) return;
      intervalRef.current = relaxedInterval(
        intervalRef.current,
        changed,
        POLL_BASE_MS,
        POLL_MAX_MS,
      );
      if (changed) setState(data);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      // ApiError 以外はサーバーに届いていない＝通信断。status 0 で区別する
      setError(
        e instanceof ApiError ? e : new ApiError('NETWORK', 'サーバーに接続できませんでした。', 0),
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  /** すぐ最新へ追いつきたいとき（画面復帰・Realtimeの合図・手動）は間隔も戻す */
  const refreshNow = useCallback(async () => {
    intervalRef.current = POLL_BASE_MS;
    await refresh();
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    // 間隔を端末ごとに少しずらす。全員が同じ瞬間に叩くのを避けるため、
    // 一定間隔ではなく、毎回ずらした時間で次を予約する
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(() => {
        // 画面が消えている間は問い合わせない。
        // 交流会では大半の人が端末をしまっているので、ここが一番効く。
        if (!document.hidden) void refresh();
        tick();
      }, nextPollDelay(intervalRef.current));
    };
    tick();

    // 戻ってきた瞬間は待たせずに最新へ追いつく
    const onVisible = () => {
      if (!document.hidden) void refreshNow();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, refreshNow]);

  useRealtimeEvent(state?.event.id ?? null, () => void refreshNow());

  return { state, loading, error, refresh: refreshNow };
}
