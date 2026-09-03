'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Bell, Eye, EyeOff, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { PushToggle } from '@/components/pwa/push-toggle';
import { IntroGate } from '@/components/spy/intro-gate';
import { PHASE_META, participantPrimaryAction } from '@/lib/core/phase';

export default function GameHomePage() {
  const { state } = useGame();
  const [roleVisible, setRoleVisible] = useState(true);

  if (!state) return null;
  const meta = PHASE_META[state.event.phase];
  const primary = participantPrimaryAction(state.event.phase);
  const latest = state.notifications[0];

  return (
    <div className="space-y-5">
      <InstallPrompt />

      {/* 自分の役割 */}
      <ClassifiedPanel className="p-5" tone={state.me.isSpy ? 'danger' : 'intel'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="label-mono">YOUR IDENTITY</p>
              <span
                className={`stamp ${state.me.isSpy ? 'border-primary text-primary' : 'border-intel text-intel'}`}
              >
                {state.me.isSpy ? 'TOP SECRET' : 'CLEARED'}
              </span>
            </div>
            <p
              className={`headline-mono mt-2 text-xl ${state.me.isSpy ? 'text-primary' : 'text-intel'}`}
            >
              {roleVisible ? (state.me.isSpy ? 'SPY' : 'INFORMATION AGENT') : '••••••••'}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {roleVisible
                ? state.me.isSpy
                  ? '正体を悟られないように振る舞ってください。'
                  : 'MISSIONを遂行し、SPYを見つけ出してください。'
                : '周囲の視線が気になるときは非表示にできます。'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRoleVisible((v) => !v)}
            className="tap-target flex shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground"
            aria-label={roleVisible ? '役割を隠す' : '役割を表示する'}
          >
            {roleVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </ClassifiedPanel>

      {/* 現在の状況 */}
      <section className="rounded-sm border border-border bg-card p-5">
        <p className="label-mono">CURRENT PHASE</p>
        <h1 className="headline-mono mt-1 text-lg text-foreground">{meta.headline}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{meta.description}</p>

        <div className="hairline my-4" />

        <div className="flex items-center justify-between">
          <div>
            <p className="label-mono">MISSION 達成数</p>
            <p className="mt-1 font-mono text-2xl text-intel">
              {state.completedCount}
              <span className="text-base text-muted-foreground"> / {state.totalCount}</span>
            </p>
          </div>
          <Target className="h-8 w-8 text-muted-foreground/50" aria-hidden />
        </div>
      </section>

      {/* 次に行うべき操作 */}
      <section>
        <p className="label-mono mb-2">NEXT ACTION</p>
        <Button asChild size="lg" className="w-full justify-between">
          <Link href={primary.href}>
            {primary.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </section>

      {/* 重要通知 */}
      <section>
        <p className="label-mono mb-2">NOTIFICATIONS</p>
        {latest ? (
          <ul className="space-y-2">
            {state.notifications.slice(0, 3).map((n) => (
              <li key={n.id} className="rounded-sm border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-amber" aria-hidden />
                  <span className="headline-mono text-xs text-amber">{n.title}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">{n.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            通知はまだありません。
          </p>
        )}
      </section>

      <section>
        <p className="label-mono mb-2">Alerts</p>
        <PushToggle />
      </section>

      <section>
        <p className="label-mono mb-2">はじめての方へ</p>
        {/* 自動再生は GameShell 側で1回だけ。ここは見直し用 */}
        <IntroGate autoPlay={false} label="遊び方の映像をもう一度見る" />
      </section>

      <section className="flex flex-wrap items-center gap-2 pt-2">
        <Badge variant="outline">EVENT {state.event.code}</Badge>
        <Badge variant="outline">参加者 {state.participantCount}名</Badge>
        {state.vote ? <Badge variant="intel">投票済み</Badge> : null}
      </section>
    </div>
  );
}
