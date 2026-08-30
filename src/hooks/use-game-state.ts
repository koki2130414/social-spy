'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiError } from '@/lib/api';
import type { ParticipantGameState } from '@/lib/types';
import { useRealtimeEvent } from './use-realtime';

const POLL_INTERVAL_MS = 4000;

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
        e instanceof ApiError
          ? e
          : new ApiError('NETWORK', 'サーバーに接続できませんでした。', 0),
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  useRealtimeEvent(state?.event.id ?? null, () => void refresh());

  return { state, loading, error, refresh };
}
