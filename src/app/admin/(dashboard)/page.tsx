'use client';

import { useState } from 'react';
import { Loader2, Play, ScanEye, ShieldAlert, Timer, Vote as VoteIcon, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PhaseBadge } from '@/components/spy/phase-badge';
import { Countdown } from '@/components/spy/countdown';
import { useAdmin } from '@/components/spy/admin-shell';
import { useAdminResource } from '@/hooks/use-admin-resource';
import { apiSend, ApiError } from '@/lib/api';
import { isValidPhaseTransition, PHASE_META } from '@/lib/core/phase';
import type { GamePhase, SpyEvent, SpyNotification } from '@/lib/types';

interface Dashboard {
  event: SpyEvent;
  participantCount: number;
  spyCount: number;
  completedMissions: number;
  totalMissions: number;
  votedCount: number;
  latestNotification: SpyNotification | null;
  joinUrl: string;
}

/**
 * 進行ボタン。
 * 押すと参加者へ通知が飛ぶので、参加者側に表示される見出しも併記しておく
 * （運営が「今どれを押したか」を参加者の画面と突き合わせられるようにするため）。
 */
const ACTIONS: Array<{
  to: GamePhase;
  label: string;
  sent: string;
  icon: typeof Play;
  danger?: boolean;
}> = [
  { to: 'ACTIVE', label: 'ゲーム開始', sent: 'OPERATION START', icon: Play },
  {
    to: 'SPY_MISSION_REVEALED',
    label: 'SPY MISSIONを公開',
    sent: 'SPY MISSION REVEALED',
    icon: ScanEye,
  },
  { to: 'VOTING', label: '投票を開始', sent: 'OPERATION TERMINATED', icon: VoteIcon, danger: true },
  {
    to: 'IDENTITY_REVEALED',
    label: 'SPYの正体を公開',
    sent: 'IDENTITY REVEAL',
    icon: ShieldAlert,
    danger: true,
  },
  { to: 'FINISHED', label: 'ゲーム終了', sent: 'MISSION COMPLETE', icon: Flag },
];

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <p className="label-mono">{label}</p>
      <p className="mt-1 font-mono text-2xl text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { eventId, reloadEvents } = useAdmin();
  const { data, loading, error, refresh } = useAdminResource<Dashboard>(
    eventId ? `/api/admin/events/${eventId}/dashboard` : null,
    5000,
  );
  const [pending, setPending] = useState<GamePhase | null>(null);
  const [confirm, setConfirm] = useState<GamePhase | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを作成してください。</p>;
  }
  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
        {error ?? 'データを取得できませんでした。'}
      </p>
    );
  }

  const changePhase = async (to: GamePhase) => {
    setPending(to);
    setActionError(null);
    try {
      await apiSend(`/api/admin/events/${eventId}/phase`, { to });
      await Promise.all([refresh(), reloadEvents()]);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'フェーズを変更できませんでした。');
    } finally {
      setPending(null);
      setConfirm(null);
    }
  };

  const { event } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">ダッシュボード</p>
          <h1 className="headline-mono mt-1 text-xl">{event.name}</h1>
        </div>
        <PhaseBadge phase={event.phase} japanese />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="参加人数" value={data.participantCount} />
        <StatTile label="SPY人数" value={data.spyCount} sub={`設定値 ${event.spyCount}`} />
        <StatTile
          label="MISSION達成"
          value={data.completedMissions}
          sub={`全 ${data.totalMissions} 件中`}
        />
        <StatTile
          label="投票済み"
          value={data.votedCount}
          sub={`${data.participantCount}名中`}
        />
        <StatTile
          label="残り時間"
          value={
            <Countdown
              activeStartedAt={event.activeStartedAt}
              durationMinutes={event.durationMinutes}
            />
          }
          sub={`${event.durationMinutes}分設定`}
        />
        <StatTile label="イベントコード" value={event.code} />
      </div>

      {data.latestNotification ? (
        <section className="rounded-sm border border-border bg-card p-4">
          <p className="label-mono">最新の通知</p>
          <p className="headline-mono mt-2 text-sm text-amber">{data.latestNotification.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.latestNotification.body}</p>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="label-mono">ゲーム進行</p>
        </div>

        {actionError ? (
          <p role="alert" className="mb-3 border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
            {actionError}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ACTIONS.map((action) => {
            const allowed = isValidPhaseTransition(event.phase, action.to);
            const Icon = action.icon;
            return (
              <Button
                key={action.to}
                size="lg"
                variant={action.danger ? 'default' : 'intel'}
                disabled={!allowed || pending !== null}
                onClick={() => setConfirm(action.to)}
                className="justify-start"
                title={allowed ? undefined : '現在のフェーズからは実行できません'}
              >
                {pending === action.to ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden />
                )}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{action.label}</span>
                  <span className="block truncate text-[10px] font-normal opacity-70">
                    参加者への通知: {action.sent}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          フェーズは1段階ずつ進みます（巻き戻しはできません）。参加者画面は自動的に切り替わります。
        </p>
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>フェーズを変更しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? (
                <>
                  <span className="headline-mono block py-2 text-base text-foreground">
                    {PHASE_META[event.phase].label} → {PHASE_META[confirm].label}
                  </span>
                  {PHASE_META[confirm].description}
                  <br />
                  この操作は取り消せません。全参加者の画面が切り替わります。
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirm) void changePhase(confirm);
              }}
              disabled={pending !== null}
            >
              実行する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
