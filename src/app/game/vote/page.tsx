'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCircle2, Loader2, Lock, UserRound, WifiOff } from 'lucide-react';
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
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { useGame } from '@/components/spy/game-shell';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { apiGet, apiSend, ApiError } from '@/lib/api';
import { canVoteInPhase } from '@/lib/core/phase';
import { MAX_VOTE_TARGETS } from '@/lib/core/vote';
import type { ParticipantGameState, PublicParticipant } from '@/lib/types';
import { cn } from '@/lib/utils';
import { resolveVoteFailure } from './vote-recovery';

/**
 * 投票がサーバーに残っているかを確かめる。
 *
 * 電波が不安定だと「送信は届いたのに返事が返らない」ことがある。
 * 見た目の失敗だけで判断すると、実際は投票済みなのに
 * 参加者へ失敗と伝えてしまうため、必ず本当の状態を見に行く。
 * ここでの確認自体が失敗したときは、投票できていない扱いにする。
 */
async function didVoteGoThrough(): Promise<boolean> {
  try {
    const state = await apiGet<ParticipantGameState>('/api/participant/state');
    return state.votedTargetIds.length > 0;
  } catch {
    return false;
  }
}

export default function VotePage() {
  const { state, refresh } = useGame();
  const online = useOnlineStatus();
  const [candidates, setCandidates] = useState<PublicParticipant[]>([]);
  // SPYだと思う人を複数選べる（上限は MAX_VOTE_TARGETS）
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const votable = state ? canVoteInPhase(state.event.phase) : false;
  const alreadyVoted = (state?.votedTargetIds.length ?? 0) > 0;

  useEffect(() => {
    if (!votable) {
      setLoading(false);
      return;
    }
    let active = true;
    apiGet<{ candidates: PublicParticipant[] }>('/api/participant/vote/candidates')
      .then((res) => {
        if (active) setCandidates(res.candidates);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : '一覧を取得できませんでした。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [votable]);

  if (!state) return null;

  if (!votable) {
    return (
      <div className="space-y-5">
        <header>
          <p className="label-mono">FINAL VOTE</p>
          <h1 className="headline-mono mt-1 text-lg">投票はまだ開始していません</h1>
        </header>
        <p className="flex items-center gap-2 rounded-sm border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          運営が OPERATION TERMINATED を宣言すると投票できます。
        </p>
      </div>
    );
  }

  if (alreadyVoted) {
    // 名前は候補一覧から引く（状態の更新を軽くするため、サーバーは名前を返さない）
    const nameOf = (id: string) => candidates.find((c) => c.id === id)?.displayName ?? '（不明）';
    return (
      <div className="space-y-5">
        <header>
          <p className="label-mono">FINAL VOTE</p>
          <h1 className="headline-mono mt-1 text-lg text-intel">投票完了</h1>
        </header>
        <ClassifiedPanel className="p-6 text-center" tone="intel" stamp="SUBMITTED">
          <CheckCircle2 className="mx-auto h-10 w-10 text-intel" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">
            あなたが選んだ {state.votedTargetIds.length} 人
          </p>
          <ul className="mt-2 space-y-1">
            {state.votedTargetIds.map((id) => (
              <li key={id} className="headline-mono text-lg text-foreground">
                {loading ? '…' : nameOf(id)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            投票は一度のみです。内容は変更できません。
          </p>
        </ClassifiedPanel>
        <Button asChild variant="outline" className="w-full">
          <Link href="/game">HOMEへ戻る</Link>
        </Button>
      </div>
    );
  }

  const selectedNames = selected.map(
    (id) => candidates.find((c) => c.id === id)?.displayName ?? '',
  );
  const atLimit = selected.length >= MAX_VOTE_TARGETS;

  const toggle = (id: string) => {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_VOTE_TARGETS) {
        setError(`選べるのは${MAX_VOTE_TARGETS}人までです。外してから選び直してください。`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const submit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend('/api/participant/vote', { targetIds: selected });
      setConfirmOpen(false);
      await refresh();
    } catch (e) {
      setConfirmOpen(false);

      // 送信は届いていたのに、返事だけ電波の切れ目で失われることがある。
      // その場合サーバーには投票が残っているので、失敗と伝えてはいけない。
      const result = await resolveVoteFailure(e, didVoteGoThrough);
      if (result.kind === 'recorded') {
        await refresh();
        return;
      }
      setError(result.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="label-mono">FINAL VOTE</p>
        <h1 className="headline-mono mt-1 text-lg text-primary">
          SPYだと思う人を選ぶ（{MAX_VOTE_TARGETS}人まで）
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          何人でも選べます（最大{MAX_VOTE_TARGETS}人）。当たった人数がそのまま点数になります。
          送信は一度だけで、確定後は変更できません。
        </p>
      </header>

      {error ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : (
        <ul className="space-y-2" aria-label="投票先">
          {candidates.map((c) => {
            const active = selected.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  disabled={!active && atLimit}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm border p-4 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border',
                      active
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {active ? (
                      <Check className="h-5 w-5" aria-hidden />
                    ) : (
                      <UserRound className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base text-foreground">
                      {c.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.affiliation ?? '所属未登録'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-[68px] z-20 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        {!online ? (
          <p className="mb-2 flex items-center gap-2 text-xs text-amber">
            <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
            オフラインのため投票できません。電波が戻ってから確定してください。
          </p>
        ) : null}
        <p className="mb-2 text-xs text-muted-foreground">
          選択中 <span className="font-mono text-foreground">{selected.length}</span> /{' '}
          {MAX_VOTE_TARGETS} 人
        </p>
        <Button
          size="lg"
          className="w-full"
          disabled={selected.length === 0 || submitting || !online}
          onClick={() => setConfirmOpen(true)}
        >
          投票を確認する
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この{selected.length}人に投票しますか？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <ul className="py-2">
                  {selectedNames.map((name) => (
                    <li key={name} className="headline-mono text-lg text-foreground">
                      {name}
                    </li>
                  ))}
                </ul>
                <p>投票は一度だけで、確定後は変更できません。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>戻る</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              投票を確定する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
