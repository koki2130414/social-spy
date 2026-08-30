'use client';

import { FileLock2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { isSpyMissionPublic } from '@/lib/core/phase';

export default function IntelPage() {
  const { state } = useGame();
  if (!state) return null;

  const published = isSpyMissionPublic(state.event.phase);
  const missions = state.spyMissions;

  // 未公開 かつ 自分がSPYでない → 何も見せない
  if (!published && !state.me.isSpy) {
    return (
      <div className="space-y-5">
        <header>
          <p className="label-mono">SPY INTEL</p>
          <h1 className="headline-mono mt-1 text-lg text-muted-foreground">CLASSIFIED</h1>
        </header>

        <ClassifiedPanel className="p-6 text-center" stamp="CLASSIFIED" tone="default">
          <FileLock2 className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">
            現在公開されているSPY情報はありません。
          </p>
          <div className="mt-5 space-y-2" aria-hidden>
            <div className="redacted mx-auto h-3 w-4/5 rounded-sm" />
            <div className="redacted mx-auto h-3 w-3/5 rounded-sm" />
            <div className="redacted mx-auto h-3 w-2/3 rounded-sm" />
          </div>
        </ClassifiedPanel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="label-mono">SPY INTEL</p>
        <h1 className="headline-mono mt-1 text-lg text-amber">
          {published ? 'SPY MISSION REVEALED' : 'YOUR SPY MISSION'}
        </h1>
        {published ? (
          <p className="mt-2 text-sm text-muted-foreground">
            SPYに与えられていたMISSIONです。これまでの会話や行動を思い出してください。
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            あなたにだけ与えられた任務です。まだ他の参加者には公開されていません。
          </p>
        )}
      </header>

      {state.me.isSpy ? (
        <div className="flex items-center gap-2">
          <Badge variant="danger">TOP SECRET</Badge>
          <span className="text-xs text-muted-foreground">この画面はあなた専用です</span>
        </div>
      ) : null}

      <ul className="space-y-3">
        {(missions ?? []).map((m, i) => (
          <li key={m.missionId}>
            <ClassifiedPanel className="p-4" tone="amber">
              <p className="label-mono">SPY MISSION {String(i + 1).padStart(2, '0')}</p>
              <h2 className="headline-mono mt-2 text-sm text-amber">{m.code}</h2>
              <p className="mt-2 text-base leading-relaxed text-foreground">{m.body}</p>
            </ClassifiedPanel>
          </li>
        ))}
      </ul>

      {published ? (
        <p className="flex items-start gap-2 rounded-sm border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
          SPYが誰なのかは、まだ公開されません。
        </p>
      ) : null}
    </div>
  );
}
