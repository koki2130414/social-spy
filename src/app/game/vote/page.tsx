'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Lock, UserRound, WifiOff } from 'lucide-react';
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
import type { PublicParticipant } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function VotePage() {
  const { state, refresh } = useGame();
  const online = useOnlineStatus();
  const [candidates, setCandidates] = useState<PublicParticipant[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const votable = state ? canVoteInPhase(state.event.phase) : false;
  const alreadyVoted = Boolean(state?.vote);

  useEffect(() => {
    if (!votable || alreadyVoted) {
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
  }, [votable, alreadyVoted]);

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

  if (alreadyVoted && state.vote) {
    return (
      <div className="space-y-5">
        <header>
          <p className="label-mono">FINAL VOTE</p>
          <h1 className="headline-mono mt-1 text-lg text-intel">投票完了</h1>
        </header>
        <ClassifiedPanel className="p-6 text-center" tone="intel" stamp="SUBMITTED">
          <CheckCircle2 className="mx-auto h-10 w-10 text-intel" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">あなたが投票した相手</p>
          <p className="headline-mono mt-2 text-xl text-foreground">
            {state.vote.targetDisplayName}
          </p>
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

  const selectedName = candidates.find((c) => c.id === selected)?.displayName ?? '';

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend('/api/participant/vote', { targetId: selected });
      setConfirmOpen(false);
      await refresh();
    } catch (e) {
      setConfirmOpen(false);
      setError(e instanceof ApiError ? e.message : '投票に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="label-mono">FINAL VOTE</p>
        <h1 className="headline-mono mt-1 text-lg text-primary">SPYだと思う人を1人選ぶ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          投票は一度だけです。確定後は変更できません。
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
        <ul className="space-y-2" role="radiogroup" aria-label="投票先">
          {candidates.map((c) => {
            const active = selected === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(c.id)}
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
                      active ? 'border-primary text-primary' : 'border-border text-muted-foreground',
                    )}
                  >
                    <UserRound className="h-5 w-5" aria-hidden />
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
        <Button
          size="lg"
          className="w-full"
          disabled={!selected || submitting || !online}
          onClick={() => setConfirmOpen(true)}
        >
          投票を確認する
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この人に投票しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="headline-mono block py-2 text-lg text-foreground">
                {selectedName}
              </span>
              投票は一度だけで、確定後は変更できません。
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
