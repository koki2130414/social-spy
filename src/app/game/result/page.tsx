'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldX, Trophy, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { apiGet, ApiError } from '@/lib/api';
import { useRanking } from '@/hooks/use-ranking';
import { isIdentityRevealed } from '@/lib/core/phase';
import type { GameResult } from '@/lib/types';
import type { FinalRankingRow } from '@/lib/core/final-score';

interface ParticipantResult extends GameResult {
  myPicks: { participantId: string; displayName: string; correct: boolean }[];
  myCorrectSpies: number;
  catchers: {
    participantId: string;
    displayName: string;
    affiliation: string | null;
    correctSpies: number;
  }[];
  finalRanking: FinalRankingRow[];
  myFinalRow: FinalRankingRow | null;
}

export default function ResultPage() {
  const { state } = useGame();
  // 正体公開後なので、ここのランキングには SPY MISSION も含まれる
  const ranking = useRanking();
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

      {/* 自分が選んだ人と、その当たり外れ */}
      <section className="rounded-sm border border-border bg-card p-5">
        <p className="label-mono">YOUR VOTE</p>
        {result.myPicks.length > 0 ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              あなたが選んだ {result.myPicks.length} 人のうち{' '}
              <span className="font-mono text-base text-intel">{result.myCorrectSpies}</span>{' '}
              人がSPYでした。
            </p>
            <ul className="mt-3 space-y-2">
              {result.myPicks.map((pick) => (
                <li
                  key={pick.participantId}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border p-3"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {pick.displayName}
                  </span>
                  {pick.correct ? (
                    <span className="flex shrink-0 items-center gap-1 text-sm text-intel">
                      <Trophy className="h-4 w-4" aria-hidden /> 正解
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4" aria-hidden /> はずれ
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldX className="h-4 w-4" aria-hidden /> 投票していません。
          </p>
        )}
      </section>

      {/* SPYを当てた人 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="label-mono">SPY CATCHERS</p>
          <Badge variant="intel">{result.catchers.length}人</Badge>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          SPYを当てた人です。外した人が誰を選んだかは出していません。
        </p>
        <ul className="space-y-2">
          {result.catchers.map((c) => (
            <li
              key={c.participantId}
              className={`flex items-center gap-3 rounded-sm border border-border p-3 ${
                c.participantId === state.me.id ? 'bg-intel/10' : 'bg-card'
              }`}
            >
              <Trophy className="h-4 w-4 shrink-0 text-amber" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{c.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.affiliation ?? '所属未登録'}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-intel">
                {c.correctSpies}人的中
              </span>
            </li>
          ))}
          {result.catchers.length === 0 ? (
            <li className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
              SPYを当てた人はいませんでした。SPYの勝ちです。
            </li>
          ) : null}
        </ul>
      </section>

      {/* 総合順位（クエスト達成率＋SPY正解） */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="label-mono">FINAL RANKING</p>
          {result.myFinalRow ? (
            <Badge variant="intel">
              あなた {result.myFinalRow.rank}位／{result.finalRanking.length}人中（
              {result.myFinalRow.points.toFixed(2)}pt）
            </Badge>
          ) : null}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          クエスト達成率100%で1.00pt、SPYを1人当てるごとに1.00ptです。
        </p>
        <ul className="space-y-2">
          {result.finalRanking.slice(0, 10).map((row) => (
            <li
              key={row.participantId}
              className={`flex items-center gap-3 rounded-sm border border-border p-3 ${
                row.participantId === state.me.id ? 'bg-intel/10' : 'bg-card'
              }`}
            >
              <span className="w-7 shrink-0 text-right font-mono text-base font-bold tabular-nums text-amber">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{row.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  達成率 {row.percent}% ／ SPY {row.correctSpies}人的中
                </span>
              </span>
              <span className="shrink-0 font-mono text-base tabular-nums text-intel">
                {row.points.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        {result.finalRanking.length > 10 && result.myFinalRow && result.myFinalRow.rank > 10 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            …あなたは {result.myFinalRow.rank} 位（{result.myFinalRow.points.toFixed(2)}pt）
          </p>
        ) : null}
      </section>

      {/* クエストの達成率。投票とは別の表彰 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="label-mono">QUEST RANKING</p>
          {ranking.data?.me ? (
            <Badge variant="intel">
              あなた {ranking.data.me.percent}% ／ {ranking.data.totalParticipants}人中
              {ranking.data.me.rank}位
            </Badge>
          ) : null}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          配られたクエストのうち何％を達成したかの順位です。SPY MISSION も含みます。
        </p>
        <ul className="space-y-2">
          {(ranking.data?.rows ?? []).slice(0, 10).map((row) => (
            <li
              key={row.participantId}
              className={`flex items-center gap-3 rounded-sm border border-border p-3 ${
                row.participantId === state.me.id ? 'bg-intel/10' : 'bg-card'
              }`}
            >
              <span className="w-7 shrink-0 text-right font-mono text-base font-bold tabular-nums text-amber">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {row.displayName}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-intel">
                {row.percent}%
              </span>
            </li>
          ))}
          {(ranking.data?.rows ?? []).length === 0 ? (
            <li className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
              集計中です。
            </li>
          ) : null}
        </ul>
        {(ranking.data?.rows ?? []).length > 10 && ranking.data?.me && ranking.data.me.rank > 10 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            …あなたは {ranking.data.me.rank} 位（{ranking.data.me.percent}%）
          </p>
        ) : null}
      </section>

      {/* 全体結果 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="label-mono">FINAL TALLY</p>
          <Badge variant="outline">投票 {result.totalVotes}票</Badge>
          <Badge variant="intel">SPYを当てた人 {result.correctVoters}人</Badge>
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
