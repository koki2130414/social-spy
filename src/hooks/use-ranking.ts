'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGetRevalidate, ApiError } from '@/lib/api';
import { nextPollDelay, relaxedInterval } from '@/lib/polling';
import type { ParticipantRanking } from '@/server/service/participant';

/**
 * ランキングの更新間隔。
 *
 * 状態の取得（15秒）とは別に問い合わせが増えるので、少し長めにしてある。
 * ランキングを開いている人だけが叩くので、全員が常に叩くわけではない。
 * サーバー側にも数秒のキャッシュがあり、同時に開かれても
 * データベースへの問い合わせはその分まとめられる。
 */
const POLL_BASE_MS = 20000;
const POLL_MAX_MS = 45000;

export function useRanking() {
  const [data, setData] = useState<ParticipantRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** いまの問い合わせ間隔。順位が動かないあいだは広がっていく */
  const intervalRef = useRef(POLL_BASE_MS);

  const refresh = useCallback(async () => {
    try {
      // 前回と同じ順位ならサーバーは本文を返さない（通信量を抑える）
      const { data: next, changed } = await apiGetRevalidate<ParticipantRanking>(
        '/api/participant/ranking',
      );
      if (!mounted.current) return;
      intervalRef.current = relaxedInterval(
        intervalRef.current,
        changed,
        POLL_BASE_MS,
        POLL_MAX_MS,
      );
      if (changed) setData(next);
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

    const onVisible = () => {
      if (document.hidden) return;
      intervalRef.current = POLL_BASE_MS;
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
