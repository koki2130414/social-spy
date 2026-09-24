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
    let warmTimer: ReturnType<typeof setTimeout>;

    /**
     * 参加者が使う画面の外枠を、あとからまとめて取っておく。
     *
     * 電波が切れたあとに再読み込みすると、まだ一度も開いていない画面は
     * ブラウザのオフライン画面になってしまう。先に取っておけば開ける。
     *
     * 受付では100台が同時に初回表示するので、その混雑には足さない。
     * 1分ほど置いて、通信が落ち着いてから取りに行く。
     * 「データを節約」設定の端末では取りに行かない。
     */
    const warmLater = () => {
      warmTimer = setTimeout(() => {
        if (cancelled || !navigator.onLine) return;
        const connection = (
          navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
        ).connection;
        if (connection?.saveData) return;
        if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return;
        navigator.serviceWorker.controller?.postMessage({
          type: 'WARM_ROUTES',
          urls: ['/game', '/game/missions', '/game/ranking', '/game/vote', '/game/result'],
        });
      }, 60000);
    };

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

        // 参加者の画面のときだけ、落ち着いてから外枠を取っておく
        if (location.pathname.startsWith('/game')) warmLater();
      } catch {
        /* 登録に失敗してもアプリの動作自体には影響させない */
      }
    };

    void register();
    return () => {
      cancelled = true;
      clearTimeout(warmTimer);
    };
  }, []);

  return null;
}
