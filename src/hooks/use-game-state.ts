'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiError } from '@/lib/api';
import type { ParticipantGameState } from '@/lib/types';
import { useRealtimeEvent } from './use-realtime';

/**
 * 保険としての問い合わせ間隔。
 *
 * フェーズ変更とお知らせは Realtime が即座に届けるので、
 * ここは Realtime が届かなかった時の取りこぼし回収でしかない。
 * 会場では全員が同時に開くため、短くするとその人数分の負荷が
 * そのままサーバーと会場の回線にかかる。100人なら4秒間隔で毎秒25回。
 */
const POLL_INTERVAL_MS = 15000;

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

  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<ParticipantGameState>('/api/participant/state');
      if (!mounted.current) return;
      setState(next);
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

  useEffect(() => {
    mounted.current = true;
    void refresh();

    // 画面が消えている間は問い合わせない。
    // 交流会では大半の人が端末をしまっているので、ここが一番効く。
    const id = setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, POLL_INTERVAL_MS);

    // 戻ってきた瞬間は待たせずに最新へ追いつく
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useRealtimeEvent(state?.event.id ?? null, () => void refresh());

  return { state, loading, error, refresh };
}
