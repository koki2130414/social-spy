'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  KeyRound,
  Loader2,
  Search,
  Shuffle,
  UserRoundCheck,
  UserRoundCog,
  UserRoundPlus,
  UserRoundX,
} from 'lucide-react';
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
  loginId: string | null;
  /** 当日その人が来ているか。false は運営が欠席にした人 */
  attending: boolean;
  joinedAt: string;
  joinUrl: string;
}

/** 発行直後にだけ手元に出す認証情報。サーバーには平文を残さない */
interface Issued {
  displayName: string;
  loginId: string;
  password: string;
  joinUrl: string;
}

/**
 * 次に渡す番号を決める。
 *
 * 受付では番号札を順番に配るので、いま使われている最大の番号の次を出す。
 * 番号以外のID（自動発行の agent-xxxx など）は数として扱わない。
 */
function nextNumber(rows: readonly { loginId: string | null }[]): string {
  let max = 0;
  for (const r of rows) {
    const n = Number(r.loginId ?? '');
    if (Number.isInteger(n) && n > max) max = n;
  }
  return String(max + 1);
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
  const [attendFilter, setAttendFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  // 欠席にする操作は押し間違いが怖いので、名前を見せて確認してから実行する
  const [confirmAbsent, setConfirmAbsent] = useState<Row | null>(null);
  const [newName, setNewName] = useState('');
  const [newAffiliation, setNewAffiliation] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [added, setAdded] = useState<Issued | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 画面を開いた直後に、次に渡す番号を入れておく。
  // 受付では番号を考える余裕がないので、そのまま追加を押せる状態にする。
  const loaded = data?.participants;
  useEffect(() => {
    if (!loaded) return;
    setNewLoginId((current) => (current === '' ? nextNumber(loaded) : current));
  }, [loaded]);

  const rows = useMemo(() => {
    const list = data?.participants ?? [];
    const filtered = list.filter((p) => {
      if (query) {
        const q = query.toLowerCase();
        const hit =
          p.displayName.toLowerCase().includes(q) || (p.loginId ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (voteFilter === 'VOTED' && !p.hasVoted) return false;
      if (voteFilter === 'NOT_VOTED' && p.hasVoted) return false;
      if (attendFilter === 'PRESENT' && !p.attending) return false;
      if (attendFilter === 'ABSENT' && p.attending) return false;
      return true;
    });
    // 受付では番号で探すので番号順。番号以外のIDは後ろへ回す
    return [...filtered].sort((a, b) => {
      const na = Number(a.loginId ?? '');
      const nb = Number(b.loginId ?? '');
      const aNum = Number.isInteger(na);
      const bNum = Number.isInteger(nb);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  }, [data, query, roleFilter, voteFilter, attendFilter]);

  const all = data?.participants ?? [];
  const presentCount = all.filter((p) => p.attending).length;
  const absentCount = all.length - presentCount;

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

  /** 運営が参加者を代理登録する */
  const addParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await apiSend<Issued>(`/api/admin/events/${eventId}/participants`, {
        displayName: newName,
        affiliation: newAffiliation,
        loginId: newLoginId,
      });
      setAdded(created);
      setNewName('');
      setNewAffiliation('');
      await refresh();
      // 受付は番号札を順に配るので、次の番号をあらかじめ入れておく
      setNewLoginId(nextNumber([...(data?.participants ?? []), { loginId: created.loginId }]));
    } catch (e2) {
      setActionError(e2 instanceof ApiError ? e2.message : '参加者を追加できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setActionError('コピーできませんでした。長押しして選択してください。');
    }
  };

  const copyJoinUrl = (row: Pick<Row, 'id' | 'joinUrl'>) => copyText(row.id, row.joinUrl);

  /** 参加者がパスワードを忘れたときに、その場で作り直す */
  const resetPassword = async (row: Row) => {
    setBusy(true);
    setActionError(null);
    try {
      const issued = await apiSend<{ loginId: string; password: string }>(
        `/api/admin/events/${eventId}/participants/${row.id}/password`,
        {},
      );
      setAdded({ displayName: row.displayName, joinUrl: row.joinUrl, ...issued });
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'パスワードを再発行できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 当日の出欠を切り替える（ドタキャン対応）。
   * 行を消さずに印を付けるだけなので、間違えても「参加に戻す」で元通りになる。
   */
  const setAttendance = async (row: Row, attending: boolean) => {
    setBusy(true);
    setActionError(null);
    try {
      await apiSend(
        `/api/admin/events/${eventId}/participants/${row.id}/attendance`,
        { attending },
        'PATCH',
      );
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '出欠を変更できませんでした。');
    } finally {
      setBusy(false);
      setConfirmAbsent(null);
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
          <p className="label-mono">参加者</p>
          <h1 className="headline-mono mt-1 text-xl">参加者一覧</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            出席 <span className="font-mono text-foreground">{presentCount}</span> 名
            {absentCount > 0 ? (
              <>
                {' / '}欠席 <span className="font-mono text-foreground">{absentCount}</span> 名
              </>
            ) : null}
          </p>
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

      {/* 運営による代理登録 */}
      <section className="rounded-sm border border-border bg-card p-5">
        <p className="label-mono">参加者を追加</p>
        <p className="mt-1 text-xs text-muted-foreground">
          受付で番号札を渡し、その番号と名前をここで登録します。
          登録するとMISSIONが3件配られ、番号でログインするためのパスワードが発行されます。
          番号欄を空にすると自動でIDが作られます。
        </p>
        <form onSubmit={addParticipant} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="new-name">名前</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 佐藤 悠真"
              maxLength={24}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-aff">所属・肩書き（任意）</Label>
            <Input
              id="new-aff"
              value={newAffiliation}
              onChange={(e) => setNewAffiliation(e.target.value)}
              placeholder="例: フリーランス / デザイナー"
              maxLength={48}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-login-id">番号（受付で渡す番号）</Label>
            <Input
              id="new-login-id"
              value={newLoginId}
              onChange={(e) => setNewLoginId(e.target.value)}
              placeholder="例: 42"
              inputMode="numeric"
              className="font-mono"
              maxLength={24}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !newName.trim()} className="w-full sm:w-auto">
              <UserRoundPlus className="h-4 w-4" aria-hidden />
              追加
            </Button>
          </div>
        </form>

        {added ? (
          <div className="mt-4 space-y-3 rounded-sm border border-intel/50 bg-intel/10 p-3">
            <p className="text-sm text-intel">
              「{added.displayName}」の認証情報です。
              <strong className="text-foreground">
                パスワードはこの画面でしか確認できません。
              </strong>
              本人に渡してから閉じてください。
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="label-mono">ID</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-sm bg-background px-2 py-1 font-mono text-sm text-foreground">
                    {added.loginId}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText('new-id', added.loginId)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {copiedId === 'new-id' ? '済' : 'コピー'}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="label-mono">パスワード</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-sm bg-background px-2 py-1 font-mono text-sm text-foreground">
                    {added.password}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText('new-pw', added.password)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {copiedId === 'new-pw' ? '済' : 'コピー'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <p className="label-mono">参加用リンク（タップするだけで入れます）</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-sm bg-background px-2 py-1 font-mono text-xs text-foreground">
                  {added.joinUrl}
                </code>
                <Button size="sm" variant="outline" onClick={() => copyText('new', added.joinUrl)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copiedId === 'new' ? 'コピーしました' : 'コピー'}
                </Button>
              </div>
            </div>

            <Button size="sm" variant="secondary" onClick={() => setAdded(null)}>
              閉じる
            </Button>
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
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
        <div className="space-y-1">
          <Label htmlFor="attend">出欠フィルター</Label>
          <select
            id="attend"
            value={attendFilter}
            onChange={(e) => setAttendFilter(e.target.value as typeof attendFilter)}
            className="min-h-[48px] w-full rounded-sm border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">すべて</option>
            <option value="PRESENT">出席のみ</option>
            <option value="ABSENT">欠席のみ</option>
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
                <TableHead>番号</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>所属・肩書き</TableHead>
                <TableHead>出欠</TableHead>
                <TableHead>役割</TableHead>
                <TableHead>MISSION</TableHead>
                <TableHead>投票</TableHead>
                <TableHead>参加日時</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className={p.attending ? undefined : 'opacity-50'}>
                  <TableCell className="font-mono text-base font-bold tabular-nums text-foreground">
                    {p.loginId ?? '-'}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{p.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{p.affiliation ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.attending ? (
                      <Badge variant="outline">出席</Badge>
                    ) : (
                      <Badge variant="danger">欠席</Badge>
                    )}
                  </TableCell>
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
                  <TableCell className="whitespace-nowrap">
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyJoinUrl(p)}
                        title="この人専用の参加用リンクをコピー"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {copiedId === p.id ? 'コピー済' : 'リンク'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => resetPassword(p)}
                        title="パスワードを作り直して表示する"
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden />
                        PW再発行
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                        詳細
                      </Button>
                      <Button
                        size="sm"
                        variant={p.role === 'SPY' ? 'secondary' : 'danger'}
                        disabled={busy || !p.attending}
                        onClick={() => toggleRole(p)}
                      >
                        <UserRoundCog className="h-3.5 w-3.5" aria-hidden />
                        {p.role === 'SPY' ? 'SPY解除' : 'SPYにする'}
                      </Button>
                      {p.attending ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setConfirmAbsent(p)}
                          title="当日来なかった人をゲームから外す"
                        >
                          <UserRoundX className="h-3.5 w-3.5" aria-hidden />
                          欠席にする
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void setAttendance(p, true)}
                          title="やっぱり参加する人を戻す"
                        >
                          <UserRoundCheck className="h-3.5 w-3.5" aria-hidden />
                          参加に戻す
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
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
              現在の役割はすべてリセットされ、{event?.spyCount ?? 0}
              名がランダムにSPYへ設定されます。
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

      <AlertDialog
        open={confirmAbsent !== null}
        onOpenChange={(open) => !open && setConfirmAbsent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAbsent?.loginId ?? '-'}番「{confirmAbsent?.displayName}」を欠席にしますか？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm">
                <p>この人はゲームから外れます。具体的には次のとおりです。</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>配った番号・パスワード・QRで入れなくなります</li>
                  <li>SPYの抽選から外れます</li>
                  <li>投票の候補に出なくなり、結果にも出ません</li>
                </ul>
                <p className="text-foreground">
                  データは消えません。あとから「参加に戻す」で元どおりにできます。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmAbsent) void setAttendance(confirmAbsent, false);
              }}
              disabled={busy}
            >
              欠席にする
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
                <p>ID: {detail?.loginId ?? '（未発行）'}</p>
                <p>所属・肩書き: {detail?.affiliation ?? '-'}</p>
                <p>出欠: {detail?.attending ? '出席' : '欠席（ゲームから外れています）'}</p>
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
