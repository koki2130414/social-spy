'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldX, Trophy, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { apiGet, ApiError } from '@/lib/api';
import { isIdentityRevealed } from '@/lib/core/phase';
import type { GameResult } from '@/lib/types';

interface ParticipantResult extends GameResult {
  myVote: { targetParticipantId: string; targetDisplayName: string } | null;
  myVoteCorrect: boolean | null;
}

export default function ResultPage() {
  const { state } = useGame();
  const [result, setResult] = useState<ParticipantResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revealed = state ? isIdentityRevealed(state.event.phase) : false;

  useEffect(() => {
    if (!revealed) return;
    let active = true;
    apiGet<ParticipantResult>('/api/participant/result')
      .then((r) => active && setResult(r))
      .catch((e) => active && setError(e instanceof ApiError ? e.message : '取得に失敗しました。'));
    return () => {
      active = false;
    };
  }, [revealed]);

  if (!state) return null;

  if (!revealed) {
    return (
      <div className="space-y-5">
        <header>
          <p className="label-mono">IDENTITY REVEAL</p>
          <h1 className="headline-mono mt-1 text-lg">まだ公開されていません</h1>
        </header>
        <p className="rounded-sm border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          運営が正体を公開すると、この画面に結果が表示されます。
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
        {error}
      </p>
    );
  }

  if (!result) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  const maxVotes = Math.max(1, ...result.rows.map((r) => r.votes));

  return (
    <div className="space-y-6">
      <header>
        <p className="label-mono">IDENTITY REVEAL</p>
        <h1 className="headline-mono mt-1 text-xl text-primary">SPYの正体</h1>
      </header>

      <ul className="space-y-3">
        {result.spies.map((spy) => (
          <li key={spy.id}>
            <ClassifiedPanel className="p-5" tone="danger" stamp="SPY">
              <p className="label-mono">CONFIRMED SPY</p>
              <p className="headline-mono mt-2 text-xl text-primary">{spy.displayName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {spy.affiliation ?? '所属未登録'}
              </p>
            </ClassifiedPanel>
          </li>
        ))}
        {result.spies.length === 0 ? (
          <li className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            このイベントにSPYは設定されていませんでした。
          </li>
        ) : null}
      </ul>

      {/* 自分の投票 */}
      <section className="rounded-sm border border-border bg-card p-5">
        <p className="label-mono">YOUR VOTE</p>
        {result.myVote ? (
          <>
            <p className="headline-mono mt-2 text-lg text-foreground">
              {result.myVote.targetDisplayName}
            </p>
            <p
              className={`mt-3 flex items-center gap-2 text-sm ${
                result.myVoteCorrect ? 'text-intel' : 'text-muted-foreground'
              }`}
            >
              {result.myVoteCorrect ? (
                <>
                  <Trophy className="h-4 w-4" aria-hidden /> 正解。SPYを見抜きました。
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" aria-hidden /> 残念。SPYではありませんでした。
                </>
              )}
            </p>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldX className="h-4 w-4" aria-hidden /> 投票していません。
          </p>
        )}
      </section>

      {/* 全体結果 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="label-mono">FINAL TALLY</p>
          <Badge variant="outline">投票 {result.totalVotes}票</Badge>
          <Badge variant="intel">的中 {result.correctVoters}人</Badge>
        </div>
        <ul className="space-y-2">
          {result.rows.map((row) => (
            <li key={row.participantId} className="rounded-sm border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-foreground">{row.displayName}</span>
                  {row.isSpy ? <Badge variant="danger">SPY</Badge> : null}
                </span>
                <span className="font-mono text-sm text-amber">{row.votes}票</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-sm bg-secondary">
                <div
                  className={`h-1.5 rounded-sm ${row.isSpy ? 'bg-primary' : 'bg-intel'}`}
                  style={{ width: `${(row.votes / maxVotes) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ClassifiedPanel className="p-6 text-center" tone="default">
        <span className="stamp mb-4 border-muted-foreground text-muted-foreground">
          OPERATION TERMINATED
        </span>
        <p className="headline-mono text-base leading-relaxed text-foreground">
          交流会は、
          <br />
          すでに諜報戦になっている。
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          お疲れさまでした。ここからは、素顔で話しましょう。
        </p>
      </ClassifiedPanel>
    </div>
  );
}
