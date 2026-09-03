'use client';

import { useEffect, useRef, useState } from 'react';
import { SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * オープニング映像。
 *
 * 初回だけ全画面で流し、一度見た人には出さない（2分あるので毎回は出さない）。
 * 見たかどうかは端末ごとに localStorage で覚える。サーバーには持たない。
 *
 * ブラウザは音ありの自動再生を止めるため、無音で再生して
 * 「音を出す」ボタンを添える。スキップはいつでも押せる。
 */

const STORAGE_KEY = 'buzz-base.intro-seen.v1';

/** 一度見たかどうか。localStorage が使えない環境では「見た」扱いにして邪魔をしない */
export function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // プライベートブラウズなどで書けなくても、再生自体は成立するので握りつぶす
  }
}

export function clearIntroSeen(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}

export function IntroVideo({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  // 再生中は背後がスクロールしないようにする
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /**
   * 再生できないまま黒画面で固まらないようにする。
   *
   * <source> を複数置いているので、最初の候補が失敗しただけで閉じてはいけない
   * （次の候補で再生できる）。すべて駄目になったときだけ閉じる。
   * それ以外の理由で始まらない場合に備えて、時間切れでも閉じる。
   */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onError = () => {
      // 候補をすべて試しても再生元が無かったときだけ諦める
      if (el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) onClose();
    };
    el.addEventListener('error', onError);

    const timeout = window.setTimeout(() => {
      const started = el.currentTime > 0 || el.readyState >= 3;
      if (!started) onClose();
    }, 12000);

    return () => {
      el.removeEventListener('error', onError);
      window.clearTimeout(timeout);
    };
  }, [onClose]);

  // Escでも閉じられるようにする（PCで運営が確認するとき用）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleSound = () => {
    const el = videoRef.current;
    if (!el) return;
    const next = !muted;
    el.muted = next;
    setMuted(next);
    // 音を出す操作は「ユーザー操作」扱いになるので、ここで再生も確実にする
    if (!next) void el.play().catch(() => undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="オープニング映像"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster="/intro/poster.jpg"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={onClose}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) setProgress((el.currentTime / el.duration) * 100);
        }}
      >
        {/* 実機はほぼ H.264。先に置いた方が採用されるので mp4 を優先する */}
        <source src="/intro/intro.mp4" type="video/mp4" />
        <source src="/intro/intro.webm" type="video/webm" />
      </video>

      {/* 進み具合。あと何分あるのかが分かると待てる */}
      <div className="absolute inset-x-0 top-0 h-1 bg-white/15">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="safe-top absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <Button
          size="sm"
          variant="outline"
          onClick={toggleSound}
          className="bg-black/50 backdrop-blur"
        >
          {muted ? (
            <>
              <VolumeX className="h-4 w-4" aria-hidden />
              音を出す
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" aria-hidden />
              消音にする
            </>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onClose}
          className="bg-black/50 backdrop-blur"
          autoFocus
        >
          スキップ
          <SkipForward className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
