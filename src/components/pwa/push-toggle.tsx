'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiGet, apiSend, ApiError } from '@/lib/api';
import {
  isIosDevice,
  isPushSupported,
  isStandaloneDisplay,
  serializeSubscription,
  urlBase64ToUint8Array,
} from '@/lib/push-client';

type Status = 'loading' | 'unavailable' | 'ios-needs-install' | 'off' | 'on' | 'denied';

/**
 * 「MISSION公開」「投票開始」などを端末の通知として受け取る設定。
 * VAPID鍵が未設定のサーバーでは何も表示しない。
 */
export function PushToggle() {
  const [status, setStatus] = useState<Status>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!isPushSupported()) {
        // iOS はホーム画面に追加しないとプッシュを購読できない（iOS 16.4以降）
        if (active) setStatus(isIosDevice() && !isStandaloneDisplay() ? 'ios-needs-install' : 'unavailable');
        return;
      }
      try {
        const res = await apiGet<{ publicKey: string | null }>('/api/participant/push/key');
        if (!active) return;
        if (!res.publicKey) {
          setStatus('unavailable');
          return;
        }
        setPublicKey(res.publicKey);

        if (Notification.permission === 'denied') {
          setStatus('denied');
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!active) return;
        setStatus(existing ? 'on' : 'off');
      } catch {
        if (active) setStatus('unavailable');
      }
    };

    void init();
    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiSend('/api/participant/push/subscribe', serializeSubscription(subscription));
      setStatus('on');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通知をオンにできませんでした。');
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiSend('/api/participant/push/unsubscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setStatus('off');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通知をオフにできませんでした。');
    } finally {
      setBusy(false);
    }
  }, []);

  if (status === 'loading' || status === 'unavailable') return null;

  if (status === 'ios-needs-install') {
    return (
      <p className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">
        通知を受け取るには、共有メニューから「ホーム画面に追加」してアプリとして開いてください。
      </p>
    );
  }

  if (status === 'denied') {
    return (
      <p className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">
        通知がブロックされています。ブラウザの設定から このサイトの通知を許可すると受け取れます。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant={status === 'on' ? 'outline' : 'intel'}
        className="w-full"
        disabled={busy}
        onClick={status === 'on' ? disable : enable}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : status === 'on' ? (
          <BellOff className="h-4 w-4" aria-hidden />
        ) : (
          <Bell className="h-4 w-4" aria-hidden />
        )}
        {status === 'on' ? '通知をオフにする' : '重要な通知を受け取る'}
      </Button>
      <p className="text-xs text-muted-foreground">
        {status === 'on'
          ? 'MISSION公開や投票開始を、スマホの通知でお知らせします。'
          : 'スマホを見ていなくても、SPY MISSION公開や投票開始に気づけます。'}
      </p>
      {error ? <p className="text-xs text-primary">{error}</p> : null}
    </div>
  );
}
