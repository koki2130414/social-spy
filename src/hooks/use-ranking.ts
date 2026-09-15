'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiError } from '@/lib/api';
import type { ParticipantRanking } from '@/server/service/participant';

/**
 * ランキングの更新間隔。
 *
 * 状態の取得（15秒）とは別に問い合わせが増えるので、少し長めにしてある。
 * ランキングを開いている人だけが叩くので、全員が常に叩くわけではない。
 * サーバー側にも数秒のキャッシュがあり、同時に開かれても
 * データベースへの問い合わせはその分まとめられる。
 */
const POLL_INTERVAL_MS = 20000;

export function useRanking() {
  const [data, setData] = useState<ParticipantRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<ParticipantRanking>('/api/participant/ranking');
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof ApiError ? e.message : '順位を取得できませんでした。');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    // 画面をしまっている間は問い合わせない（会場では大半がこの状態）
    const id = setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, POLL_INTERVAL_MS);

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

  return { data, loading, error, refresh };
}
