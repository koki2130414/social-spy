'use client';

import { useEffect } from 'react';

/**
 * Service Worker の登録。
 * 開発中は HMR と競合するため本番ビルドでのみ登録する。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        // 新しいバージョンが用意できたら、次回の起動を待たずに切り替える
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      } catch {
        /* 登録に失敗してもアプリの動作自体には影響させない */
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
