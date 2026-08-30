'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search, Shuffle, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useAdmin } from '@/components/spy/admin-shell';
import { useAdminResource } from '@/hooks/use-admin-resource';
import { apiSend, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import type { ParticipantRole } from '@/lib/types';

interface Row {
  id: string;
  displayName: string;
  affiliation: string | null;
  role: ParticipantRole;
  completed: number;
  total: number;
  hasVoted: boolean;
  votedFor: string | null;
  joinedAt: string;
}

export default function AdminParticipantsPage() {
  const { eventId, event } = useAdmin();
  const { data, loading, error, refresh } = useAdminResource<{ participants: Row[] }>(
    eventId ? `/api/admin/events/${eventId}/participants` : null,
    6000,
  );
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | ParticipantRole>('ALL');
  const [voteFilter, setVoteFilter] = useState<'ALL' | 'VOTED' | 'NOT_VOTED'>('ALL');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  const rows = useMemo(() => {
    const list = data?.participants ?? [];
    return list.filter((p) => {
      if (query && !p.displayName.toLowerCase().includes(query.toLowerCase())) return false;
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (voteFilter === 'VOTED' && !p.hasVoted) return false;
      if (voteFilter === 'NOT_VOTED' && p.hasVoted) return false;
      return true;
    });
  }, [data, query, roleFilter, voteFilter]);

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを選択してください。</p>;
  }

  const autoAssign = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await apiSend(`/api/admin/events/${eventId}/spies`, { mode: 'auto' });
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'SPYを選出できませんでした。');
    } finally {
      setBusy(false);
      setConfirmAuto(false);
    }
  };

  const toggleRole = async (row: Row) => {
    setBusy(true);
    setActionError(null);
    try {
      await apiSend(`/api/admin/events/${eventId}/spies`, {
        mode: 'manual',
        participantId: row.id,
        role: row.role === 'SPY' ? 'AGENT' : 'SPY',
      });
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '役割を変更できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">PARTICIPANTS</p>
          <h1 className="headline-mono mt-1 text-xl">参加者一覧</h1>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => setConfirmAuto(true)}>
          <Shuffle className="h-4 w-4" aria-hidden />
          SPYを自動選出（{event?.spyCount ?? 0}名）
        </Button>
      </header>

      {actionError ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="q">名前検索</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              placeholder="名前で絞り込み"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="role">役割フィルター</Label>
          <select
            id="role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="min-h-[48px] w-full rounded-sm border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">すべて</option>
            <option value="AGENT">情報員のみ</option>
            <option value="SPY">SPYのみ</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="vote">投票状態フィルター</Label>
          <select
            id="vote"
            value={voteFilter}
            onChange={(e) => setVoteFilter(e.target.value as typeof voteFilter)}
            className="min-h-[48px] w-full rounded-sm border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">すべて</option>
            <option value="VOTED">投票済み</option>
            <option value="NOT_VOTED">未投票</option>
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : error ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {error}
        </p>
      ) : (
        <div className="rounded-sm border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>所属・肩書き</TableHead>
                <TableHead>役割</TableHead>
                <TableHead>MISSION</TableHead>
                <TableHead>投票</TableHead>
                <TableHead>参加日時</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-foreground">{p.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{p.affiliation ?? '-'}</TableCell>
                  <TableCell>
                    {p.role === 'SPY' ? (
                      <Badge variant="danger">SPY</Badge>
                    ) : (
                      <Badge variant="outline">AGENT</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-intel">
                    {p.completed}/{p.total}
                  </TableCell>
                  <TableCell>
                    {p.hasVoted ? (
                      <Badge variant="intel">投票済み</Badge>
                    ) : (
                      <Badge variant="outline">未投票</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(p.joinedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                        詳細
                      </Button>
                      <Button
                        size="sm"
                        variant={p.role === 'SPY' ? 'secondary' : 'danger'}
                        disabled={busy}
                        onClick={() => toggleRole(p)}
                      >
                        <UserRoundCog className="h-3.5 w-3.5" aria-hidden />
                        {p.role === 'SPY' ? 'SPY解除' : 'SPYにする'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    該当する参加者がいません。
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmAuto} onOpenChange={setConfirmAuto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>SPYを自動選出しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              現在の役割はすべてリセットされ、{event?.spyCount ?? 0}名がランダムにSPYへ設定されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void autoAssign();
              }}
              disabled={busy}
            >
              選出する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{detail?.displayName}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm">
                <p>所属・肩書き: {detail?.affiliation ?? '-'}</p>
                <p>役割: {detail?.role === 'SPY' ? 'SPY' : 'INFORMATION AGENT'}</p>
                <p>
                  MISSION達成: {detail?.completed} / {detail?.total}
                </p>
                <p>投票: {detail?.hasVoted ? `${detail.votedFor ?? '-'} へ投票済み` : '未投票'}</p>
                <p>参加日時: {detail ? formatDateTime(detail.joinedAt) : '-'}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>閉じる</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
