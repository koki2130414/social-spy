'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { useRanking } from '@/hooks/use-ranking';
import type { RankingRow } from '@/lib/types';

/** 上位だけ色を変える。1位・2位・3位 */
function rankTone(rank: number): string {
  if (rank === 1) return 'text-amber';
  if (rank <= 3) return 'text-intel';
  return 'text-muted-foreground';
}

function Row({ row, isMe }: { row: RankingRow; isMe: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${
        isMe ? 'bg-intel/10' : ''
      }`}
    >
      <span
        className={`w-9 shrink-0 text-right font-mono text-base font-bold tabular-nums ${rankTone(row.rank)}`}
      >
        {row.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {row.displayName}
          {isMe ? <span className="ml-1 text-xs text-intel">（あなた）</span> : null}
        </span>
        {row.affiliation ? (
          <span className="block truncate text-xs text-muted-foreground">{row.affiliation}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="font-mono text-base font-bold tabular-nums text-foreground">
          {row.percent}
        </span>
        <span className="text-xs text-muted-foreground">%</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
          {row.completed}/{row.total}
        </span>
      </span>
    </li>
  );
}

export default function RankingPage() {
  const { state } = useGame();
  const { data, loading, error, refresh } = useRanking();

  if (!state) return null;

  const me = data?.me ?? null;

  return (
    <div className="space-y-5">
      <header>
        <p className="label-mono">QUEST RANKING</p>
        <h1 className="headline-mono mt-1 text-lg">クエスト達成率</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          配られたクエストのうち、何％を達成したかの順位です。
          同じ達成率なら、先に達成した人が上に出ます。
        </p>
      </header>

      {/* 自分の位置 */}
      <ClassifiedPanel className="p-5" tone="intel">
        <p className="label-mono">あなたの達成率</p>
        {me ? (
          <>
            <p className="headline-mono mt-2 text-3xl text-intel">
              {me.percent}
              <span className="text-lg">%</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {data?.totalParticipants ?? 0}人中 <strong className="text-foreground">{me.rank}</strong>
              位 ／ クエスト {me.completed}/{me.total} 件
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">まだ集計されていません。</p>
        )}
      </ClassifiedPanel>

      {data?.includesSpyMissions ? (
        <p className="flex items-center gap-2 rounded-sm border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          正体公開後のため、SPY MISSION も達成率に含まれています。
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="label-mono">全体ランキング</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          更新
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : (
        <ul className="rounded-sm border border-border bg-card">
          {(data?.rows ?? []).map((row) => (
            <Row key={row.participantId} row={row} isMe={row.participantId === state.me.id} />
          ))}
          {(data?.rows ?? []).length === 0 ? (
            <li className="px-3 py-10 text-center text-sm text-muted-foreground">
              まだ参加者がいません。
            </li>
          ) : null}
        </ul>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Badge variant="outline">自動更新</Badge>
        <span className="ml-2">20秒ごとに更新されます。</span>
      </p>
    </div>
  );
}
