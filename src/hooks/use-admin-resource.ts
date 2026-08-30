'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiError } from '@/lib/api';

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
    const id = setInterval(() => void refresh(), pollMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh, url, pollMs]);

  return { data, loading, error, refresh, setError };
}
