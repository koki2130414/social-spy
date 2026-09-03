'use client';

import { createContext, useContext, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList, EyeOff, Home, Loader2, Trophy, Vote, WifiOff } from 'lucide-react';
import { IntroGate } from './intro-gate';
import { useGameState, type GameStateResult } from '@/hooks/use-game-state';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { PHASE_META, canVoteInPhase, isIdentityRevealed, isSpyMissionPublic } from '@/lib/core/phase';
import { cn } from '@/lib/utils';
import { SpyLogo } from './logo';
import { PhaseBadge } from './phase-badge';
import { Countdown } from './countdown';

const GameContext = createContext<GameStateResult | null>(null);

export function useGame(): GameStateResult {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameShell');
  return ctx;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  enabled: boolean;
  reason?: string;
}

export function GameShell({ children }: { children: React.ReactNode }) {
  const game = useGameState();
  const online = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();

  // 通信が届いていない（status 0）場合は、参加情報の問題ではないので再登録へ誘導しない
  const networkDown = !online || game.error?.status === 0;
  const sessionInvalid =
    !networkDown && (game.error?.status === 401 || game.error?.status === 404);

  useEffect(() => {
    if (sessionInvalid) router.replace('/join');
  }, [sessionInvalid, router]);

  if (game.loading && !game.state) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (!game.state) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
        {networkDown ? (
          <>
            <WifiOff className="h-8 w-8 text-amber" aria-hidden />
            <div>
              <p className="headline-mono text-sm text-amber">SIGNAL LOST</p>
              <p className="mt-2 text-sm text-muted-foreground">
                通信が届いていません。アプリは閉じずにそのままお待ちください。
                <br />
                電波が戻ると自動的に再開します。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void game.refresh()}
              className="tap-target headline-mono rounded-sm border border-border px-5 text-sm text-foreground"
            >
              今すぐ再試行
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {game.error?.message ?? '参加情報が確認できませんでした。'}
            </p>
            <Link
              href="/join"
              className="headline-mono text-sm text-intel underline underline-offset-4"
            >
              参加登録へ
            </Link>
          </>
        )}
      </div>
    );
  }

  const { state } = game;
  const phase = state.event.phase;
  const spyIntelAvailable = state.me.isSpy || isSpyMissionPublic(phase);

  const nav: NavItem[] = [
    { href: '/game', label: 'HOME', icon: Home, enabled: true },
    {
      href: '/game/missions',
      label: 'MISSION',
      icon: ClipboardList,
      enabled: true,
    },
    {
      href: '/game/intel',
      label: 'INTEL',
      icon: EyeOff,
      enabled: spyIntelAvailable,
      reason: 'SPY情報は未公開です',
    },
    {
      href: '/game/vote',
      label: 'VOTE',
      icon: Vote,
      enabled: canVoteInPhase(phase),
      reason: '投票フェーズになると開きます',
    },
    {
      href: '/game/result',
      label: 'RESULT',
      icon: Trophy,
      enabled: isIdentityRevealed(phase),
      reason: '正体公開後に開きます',
    },
  ];

  return (
    <GameContext.Provider value={game}>
      <div className="flex min-h-dvh flex-col">
        <header className="safe-top safe-x sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto w-full max-w-lg px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <SpyLogo compact />
              <PhaseBadge phase={phase} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="truncate text-foreground">
                  <span className="label-mono mr-2">AGENT</span>
                  {state.me.displayName}
                </p>
              </div>
              <p className="label-mono shrink-0 text-foreground/80">
                <span className="mr-1.5">残り</span>
                <Countdown
                  activeStartedAt={state.event.activeStartedAt}
                  durationMinutes={state.event.durationMinutes}
                  className="font-mono text-sm tracking-normal text-amber"
                />
              </p>
            </div>
          </div>
        </header>

        {!online ? (
          <p
            role="status"
            className="safe-x flex items-center justify-center gap-2 border-b border-amber/40 bg-amber/10 px-4 py-2 text-xs text-amber"
          >
            <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
            オフラインです。記録した達成は復帰後に自動送信されます。
          </p>
        ) : null}

        {/* 初めてゲーム画面に入った人にオープニングを流す（自動再生はここ1か所だけ） */}
        <IntroGate autoPlay showRewatch={false} />

        <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-5">{children}</main>

        <nav
          aria-label="メインナビゲーション"
          className="no-callout safe-x fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/97 backdrop-blur safe-bottom"
        >
          <ul className="mx-auto flex w-full max-w-lg">
            {nav.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const content = (
                <span
                  className={cn(
                    'flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2',
                    active && item.enabled ? 'text-intel' : 'text-muted-foreground',
                    !item.enabled && 'opacity-40',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="font-mono text-[10px] tracking-[0.1em]">{item.label}</span>
                </span>
              );
              return (
                <li key={item.href} className="flex-1">
                  {item.enabled ? (
                    <Link href={item.href} aria-current={active ? 'page' : undefined}>
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={item.reason}
                      aria-label={`${item.label}（${item.reason}）`}
                      className="w-full cursor-not-allowed"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <span className="sr-only" aria-live="polite">
        現在のフェーズ: {PHASE_META[phase].label}
      </span>
    </GameContext.Provider>
  );
}
