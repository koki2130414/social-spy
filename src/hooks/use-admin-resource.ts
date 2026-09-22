'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiError } from '@/lib/api';
import { nextPollDelay } from '@/lib/polling';

/** 管理画面用のデータ取得。任意でポーリングして自動更新する */
export function useAdminResource<T>(url: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const next = await apiGet<T>(url);
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof ApiError ? e.message : '取得に失敗しました。');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    setLoading(Boolean(url));
    void refresh();
    if (!url || pollMs <= 0) return () => void (mounted.current = false);

    // 運営のパソコンは画面を開きっぱなしにしがちで、別のタブを見ている間も
    // 数秒おきに集計を取りに行っていた。見ていない画面のために
    // データベースを回すと、その負荷は参加者の待ち時間として返ってくる。
    // 間隔も毎回ずらして、他の画面と足並みがそろわないようにする。
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(() => {
        if (!document.hidden) void refresh();
        tick();
      }, nextPollDelay(pollMs));
    };
    tick();

    // 戻ってきた瞬間は待たせずに最新へ追いつく
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, url, pollMs]);

  return { data, loading, error, refresh, setError };
}
