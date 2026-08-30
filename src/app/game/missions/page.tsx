'use client';

import { useState } from 'react';
import { CheckCircle2, CloudUpload, Circle, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { canUpdateMissionProgress } from '@/lib/core/phase';
import type { AssignedMission } from '@/lib/types';

/** 未送信の操作を重ねた表示用のMISSION */
interface DisplayMission extends AssignedMission {
  unsent: boolean;
}

function MissionItem({
  mission,
  index,
  locked,
  onToggle,
  pending,
  variant,
}: {
  mission: DisplayMission;
  index: number;
  locked: boolean;
  onToggle: (mission: DisplayMission) => void;
  pending: boolean;
  variant: 'general' | 'spy';
}) {
  const done = mission.completed;
  return (
    <li>
      <ClassifiedPanel
        className="p-4"
        tone={done ? 'intel' : variant === 'spy' ? 'danger' : 'default'}
        stamp={done ? 'COMPLETE' : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-mono">
            {variant === 'spy' ? 'SPY MISSION' : 'MISSION'} {String(index + 1).padStart(2, '0')}
          </span>
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-intel" aria-hidden />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground/60" aria-hidden />
          )}
          {mission.unsent ? (
            <Badge variant="amber" title="通信が戻ると自動で送信されます">
              <CloudUpload className="mr-1 h-3 w-3" aria-hidden />
              未送信
            </Badge>
          ) : null}
        </div>

        <h2
          className={`headline-mono mt-2 text-sm ${variant === 'spy' ? 'text-primary' : 'text-amber'}`}
        >
          {mission.code}
        </h2>
        <p className="mt-2 text-base leading-relaxed text-foreground">{mission.body}</p>

        <div className="mt-4">
          {done ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={locked || pending}
              onClick={() => onToggle(mission)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              達成を取り消す
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="intel" className="w-full" disabled={locked || pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  MISSION COMPLETE
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>達成を記録しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{mission.body}」を達成済みとして記録します。あとから取り消すこともできます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onToggle(mission)}>
                    達成にする
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </ClassifiedPanel>
    </li>
  );
}

export default function MissionsPage() {
  const { state, refresh } = useGame();
  const sync = useOfflineSync(refresh);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;

  const locked = !canUpdateMissionProgress(state.event.phase);

  /** サーバーの状態に、まだ送れていない操作を重ねる */
  const merge = (list: AssignedMission[]): DisplayMission[] =>
    list.map((m) => {
      const queued = sync.pending[m.assignmentId];
      return {
        ...m,
        completed: queued === undefined ? m.completed : queued,
        unsent: queued !== undefined,
      };
    });

  const missions = merge(state.missions);
  const ownSpyMissions = state.me.isSpy ? merge(state.spyMissions ?? []) : [];
  const completedCount = missions.filter((m) => m.completed).length;

  const toggle = async (mission: DisplayMission) => {
    setPendingId(mission.assignmentId);
    setError(null);
    const result = await sync.submitMission(mission.assignmentId, !mission.completed);
    if (result.status === 'sent') await refresh();
    if (result.status === 'rejected') setError(result.message);
    setPendingId(null);
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="label-mono">YOUR MISSION</p>
        <h1 className="headline-mono mt-1 text-lg">
          達成 {completedCount} / {state.totalCount}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          達成は自己申告制です。人と話すことに集中してください。
        </p>
      </header>

      {locked ? (
        <p className="flex items-center gap-2 rounded-sm border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          {state.event.phase === 'LOBBY'
            ? 'ゲーム開始前のため、まだ達成の記録はできません。'
            : 'MISSIONの受付は終了しました。'}
        </p>
      ) : null}

      {sync.pendingCount > 0 ? (
        <p className="flex items-center gap-2 rounded-sm border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          <CloudUpload className="h-4 w-4 shrink-0" aria-hidden />
          {sync.pendingCount}件が未送信です。通信が戻ると自動的に送信されます。
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {missions.map((m, i) => (
          <MissionItem
            key={m.assignmentId}
            mission={m}
            index={i}
            locked={locked}
            pending={pendingId === m.assignmentId}
            onToggle={toggle}
            variant="general"
          />
        ))}
      </ul>

      {ownSpyMissions.length > 0 ? (
        <section className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Badge variant="danger">CLASSIFIED</Badge>
            <p className="label-mono">あなただけのMISSION</p>
          </div>
          <p className="text-sm text-muted-foreground">
            これはSPY専用の任務です。他の参加者には見えていません。
          </p>
          <ul className="space-y-3">
            {ownSpyMissions.map((m, i) => (
              <MissionItem
                key={m.assignmentId}
                mission={m}
                index={i}
                locked={locked}
                pending={pendingId === m.assignmentId}
                onToggle={toggle}
                variant="spy"
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
