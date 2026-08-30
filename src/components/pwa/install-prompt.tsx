'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'social-spy.install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * ホーム画面への追加を促すバー。
 *  - Android / デスクトップ Chrome: beforeinstallprompt を使ってワンタップで追加
 *  - iOS Safari: 同イベントが無いため、共有メニューからの手順を案内する
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;

    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* localStorage が使えない場合は表示する */
    }
    setDismissed(false);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS はイベントが来ないので、少し待ってから案内を出す
    const timer = setTimeout(() => {
      if (isIos()) setShowIosHint(true);
    }, 1200);

    const onInstalled = () => setDismissed(true);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(timer);
    };
  }, []);

  const close = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 保存できなくても閉じる */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    close();
  };

  if (dismissed || (!deferred && !showIosHint)) return null;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-sm border border-intel/40 bg-intel/10 p-3"
      role="region"
      aria-label="ホーム画面に追加"
    >
      <SquarePlus className="mt-0.5 h-4 w-4 shrink-0 text-intel" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="headline-mono text-xs text-intel">ホーム画面に追加</p>
        {deferred ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              アプリとして起動でき、全画面で使えます。
            </p>
            <Button size="sm" variant="intel" className="mt-2" onClick={install}>
              追加する
            </Button>
          </>
        ) : (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            画面下の
            <Share className="inline h-3.5 w-3.5 text-foreground" aria-label="共有" />
            共有ボタンから「ホーム画面に追加」を選ぶと、アプリとして起動できます。
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="閉じる"
        className="tap-target -m-2 flex shrink-0 items-center justify-center text-muted-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
