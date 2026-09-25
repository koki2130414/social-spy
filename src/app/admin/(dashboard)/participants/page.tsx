'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Download,
  KeyRound,
  QrCode,
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
import { apiGet, apiSend, ApiError } from '@/lib/api';
import { formatDateTime, formatTime } from '@/lib/datetime';
import type { ParticipantRole } from '@/lib/types';
import { downloadBlob, downloadTextFile } from '@/lib/download-csv';
import { buildParticipantsCsv } from './participants-csv';

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
  /** 受付で伝える数字4桁。運営画面だけに出る */
  issuedPassword: string | null;
  /** 当日その人が来ているか。false は運営が欠席にした人 */
  attending: boolean;
  /** 最初にアプリへ入れた時刻。null なら、まだ一度も入れていない */
  enteredAt: string | null;
  joinedAt: string;
  joinUrl: string;
}

/** 発行直後に大きく表示する認証情報（本人に渡すため） */
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
  const { eventId, event, reloadEvents } = useAdmin();
  const { data, loading, error, refresh } = useAdminResource<{ participants: Row[] }>(
    eventId ? `/api/admin/events/${eventId}/participants` : null,
    6000,
  );
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | ParticipantRole>('ALL');
  const [voteFilter, setVoteFilter] = useState<'ALL' | 'VOTED' | 'NOT_VOTED'>('ALL');
  const [attendFilter, setAttendFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [enterFilter, setEnterFilter] = useState<'ALL' | 'ENTERED' | 'NOT_ENTERED'>('ALL');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  /**
   * 自動選出で何人SPYにするか。
   *
   * 当日その場で「思ったより人が少ない／多い」と分かることがあるので、
   * イベント設定を開き直さなくても、ここで直して選び直せるようにしている。
   * 入力中は空にもできるよう、数値ではなく文字列で持つ。
   */
  const [spyCountInput, setSpyCountInput] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  // 表示名の変更（詳細ダイアログの中）
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  // 欠席にする操作は押し間違いが怖いので、名前を見せて確認してから実行する
  const [confirmAbsent, setConfirmAbsent] = useState<Row | null>(null);
  /**
   * パスワードは既定で伏せておく。
   * 受付の画面はプロジェクタや後ろの人から見えることがあるため、
   * 必要なときだけ出す。
   */
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const toggleReveal = (id: string) =>
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [newName, setNewName] = useState('');
  const [newAffiliation, setNewAffiliation] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [added, setAdded] = useState<Issued | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // カードをなくした人に、その場で画面を見せて読んでもらうためのQR
  const [qr, setQr] = useState<{ row: Row; dataUrl: string } | null>(null);
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

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
      if (enterFilter === 'ENTERED' && !p.enteredAt) return false;
      if (enterFilter === 'NOT_ENTERED' && p.enteredAt) return false;
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
  }, [data, query, roleFilter, voteFilter, attendFilter, enterFilter]);

  const all = data?.participants ?? [];
  const presentCount = all.filter((p) => p.attending).length;
  const absentCount = all.length - presentCount;
  // 受付でいちばん見たい数字。出席にしている人のうち、実際に入れた人
  const enteredCount = all.filter((p) => p.attending && p.enteredAt).length;

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを選択してください。</p>;
  }

  /** 確認ダイアログを開く。人数の初期値はイベントの設定から入れておく */
  const openAutoAssign = () => {
    setSpyCountInput(String(event?.spyCount ?? 0));
    setConfirmAuto(true);
  };

  const requestedSpyCount = Number(spyCountInput);
  const spyCountValid =
    spyCountInput.trim() !== '' &&
    Number.isInteger(requestedSpyCount) &&
    requestedSpyCount >= 0 &&
    requestedSpyCount <= Math.min(20, presentCount);

  /** 詳細を開く。表示名の入力欄には今の名前を入れておく */
  const openDetail = (row: Row) => {
    setRenameInput(row.displayName);
    setRenameError(null);
    setDetail(row);
  };

  /** 表示名を変える。QRとパスワードは変わらない */
  const rename = async () => {
    if (!detail) return;
    const next = renameInput.trim();
    if (!next || next === detail.displayName) return;
    setBusy(true);
    setRenameError(null);
    try {
      await apiSend(
        `/api/admin/events/${eventId}/participants/${detail.id}/name`,
        { displayName: next },
        'PATCH',
      );
      await refresh();
      setDetail({ ...detail, displayName: next });
    } catch (e) {
      setRenameError(e instanceof ApiError ? e.message : '表示名を変更できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const autoAssign = async () => {
    if (!spyCountValid) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiSend(`/api/admin/events/${eventId}/spies`, {
        mode: 'auto',
        count: requestedSpyCount,
      });
      // イベントも読み直す。人数の設定を書き換えているので、
      // ここを忘れるとボタンに出る人数が古いままになる
      await Promise.all([refresh(), reloadEvents()]);
      setConfirmAuto(false);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'SPYを選出できませんでした。');
    } finally {
      setBusy(false);
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

  /**
   * 受付用の一覧をCSVで落とす。
   *
   * 画面に出ている並び（番号順）と絞り込みをそのまま反映する。
   * 見たとおりのものが落ちてこないと、受付で照合するときに混乱するため。
   */
  // ファイル名を半角英数字にしているのは、日本語名だと環境によって
  // 「download」という拡張子なしのファイルになってしまうため
  const downloadCsv = () =>
    downloadTextFile(`${event?.code ?? 'event'}_participants.csv`, buildParticipantsCsv(rows));

  /**
   * CSVと全員ぶんのQR画像をZIPでまとめて落とす。
   *
   * 画像はサーバーで作る。101人ぶんを端末で作らせると、
   * 受付で使う安い端末だと固まることがあるため。
   * 絞り込みは効かず、いつも全員ぶんが入る（配り物の作り直し用なので）。
   */
  const downloadZip = async () => {
    setZipBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/participants/export`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('failed');
      downloadBlob(`${event?.code ?? 'event'}_participants_qr.zip`, await res.blob());
    } catch {
      setActionError('QR付きZIPを作れませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setZipBusy(false);
    }
  };

  /**
   * その人専用のQRを画面に出す。
   *
   * 中身は配ったカードのQRと同じリンク。読み取るとその人としてログインする。
   * つまり他人に見せるとなりすまされるので、本人だと確かめてから出すこと。
   */
  const showQr = async (row: Row) => {
    setQrLoadingId(row.id);
    setActionError(null);
    try {
      const res = await apiGet<{ dataUrl: string }>(
        `/api/admin/events/${eventId}/participants/${row.id}/qrcode`,
      );
      setQr({ row, dataUrl: res.dataUrl });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'QRコードを作れませんでした。');
    } finally {
      setQrLoadingId(null);
    }
  };

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
          <p className="mt-1 text-xs">
            <span className="text-muted-foreground">入場（QRを読めた人）</span>{' '}
            <span className="font-mono text-base text-intel">{enteredCount}</span>
            <span className="text-muted-foreground"> / {presentCount} 名</span>
            {presentCount - enteredCount > 0 ? (
              <span className="text-muted-foreground">
                {' '}
                ・まだ {presentCount - enteredCount} 名
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            title="いま表示されている一覧をCSVで保存する"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSVで保存（{rows.length}名）
          </Button>
          <Button
            variant="outline"
            onClick={() => void downloadZip()}
            disabled={zipBusy}
            title="CSVと全員ぶんのQR画像をZIPでまとめて保存する（絞り込みに関わらず全員）"
          >
            {zipBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <QrCode className="h-4 w-4" aria-hidden />
            )}
            {zipBusy ? '作成中…' : 'CSV＋QRをZIPで保存'}
          </Button>
          <Button variant="outline" disabled={busy} onClick={openAutoAssign}>
            <Shuffle className="h-4 w-4" aria-hidden />
            SPYを自動選出（{event?.spyCount ?? 0}名）
          </Button>
        </div>
      </header>

      {actionError ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {actionError}
        </p>
      ) : null}

      <p className="rounded-sm border border-amber/40 bg-amber/10 p-3 text-xs text-amber">
        CSVとZIPには全員のパスワードとQR（読むとその人になれるリンク）が入ります。受付以外へ渡さないでください。
      </p>

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
        <div className="space-y-1">
          <Label htmlFor="enter">入場フィルター</Label>
          <select
            id="enter"
            value={enterFilter}
            onChange={(e) => setEnterFilter(e.target.value as typeof enterFilter)}
            className="min-h-[48px] w-full rounded-sm border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">すべて</option>
            <option value="ENTERED">入場済みのみ</option>
            <option value="NOT_ENTERED">まだ入っていない人のみ</option>
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
                <TableHead className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    パスワード
                    <button
                      type="button"
                      onClick={() => setShowAllPasswords((v) => !v)}
                      className="text-[10px] font-normal text-intel underline underline-offset-2"
                    >
                      {showAllPasswords ? 'すべて隠す' : 'すべて表示'}
                    </button>
                  </span>
                </TableHead>
                <TableHead>所属・肩書き</TableHead>
                <TableHead>入場</TableHead>
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
                  <TableCell className="whitespace-nowrap">
                    {p.issuedPassword ? (
                      <button
                        type="button"
                        onClick={() => toggleReveal(p.id)}
                        title={
                          showAllPasswords || revealedIds.has(p.id)
                            ? 'クリックで隠す'
                            : 'クリックで表示'
                        }
                        className="font-mono text-base tabular-nums tracking-[0.2em] text-foreground"
                      >
                        {showAllPasswords || revealedIds.has(p.id) ? p.issuedPassword : '••••'}
                      </button>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground"
                        title="この人のパスワードは記録が残っていません。PW再発行を押すと新しい番号が出ます。"
                      >
                        未記録
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.affiliation ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.enteredAt ? (
                      <span className="inline-flex flex-col">
                        <Badge variant="intel">入場済み</Badge>
                        <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {formatTime(p.enteredAt)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">まだ</span>
                    )}
                  </TableCell>
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
                        disabled={qrLoadingId === p.id}
                        onClick={() => void showQr(p)}
                        title="カードをなくした人に見せるQR。読むとこの人としてログインします"
                      >
                        {qrLoadingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <QrCode className="h-3.5 w-3.5" aria-hidden />
                        )}
                        QR
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
                      {/*
                        受付で使う順に並べている。
                        「欠席にする」は当日いちばん押すボタンなので、
                        横スクロールしないと届かない位置に置かない。
                      */}
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
                      <Button size="sm" variant="outline" onClick={() => openDetail(p)}>
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
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
              出席している{presentCount}名の中から、下の人数だけランダムにSPYを決めます。
              今の役割はいったんすべて戻ります。欠席の人は選ばれません。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="spyCountInput">SPYの人数</Label>
            <Input
              id="spyCountInput"
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.min(20, presentCount)}
              value={spyCountInput}
              onChange={(e) => setSpyCountInput(e.target.value)}
              disabled={busy}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              0〜{Math.min(20, presentCount)}名まで。ここで変えると、イベントの設定にも残ります。
            </p>
            {!spyCountValid && spyCountInput.trim() !== '' ? (
              <p role="alert" className="text-xs text-primary">
                0〜{Math.min(20, presentCount)}の整数で入力してください。
              </p>
            ) : null}
            {actionError ? (
              <p role="alert" className="text-xs text-primary">
                {actionError}
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void autoAssign();
              }}
              disabled={busy || !spyCountValid}
            >
              {spyCountValid ? `${requestedSpyCount}名を選出する` : '選出する'}
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

      {/*
        QR表示。スマホのカメラを向けてもらうので、画面の大半をQRにする。
        あとから紙のカードが出てきても、同じリンクなのでどちらも使える。
      */}
      <AlertDialog open={qr !== null} onOpenChange={(open) => !open && setQr(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {qr?.row.loginId ?? '-'}番 {qr?.row.displayName}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm">
                <p>本人にこのQRを読んでもらうと、そのままログインします。</p>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr.dataUrl}
                    alt={`${qr.row.displayName}さんの参加用QRコード`}
                    className="mx-auto block h-auto w-full max-w-[280px] rounded-sm border border-border bg-white p-2"
                  />
                ) : null}
                <p className="text-center">
                  パスワード:{' '}
                  <span className="font-mono text-base tracking-[0.2em] text-foreground">
                    {qr?.row.issuedPassword ?? '（記録なし）'}
                  </span>
                </p>
                <p className="text-xs text-primary">
                  このQRは読んだ人をこの人としてログインさせます。
                  本人だと確かめてから画面を見せてください。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>閉じる</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (qr) void copyText(`qr-${qr.row.id}`, qr.row.joinUrl);
              }}
            >
              {qr && copiedId === `qr-${qr.row.id}` ? 'コピーしました' : 'リンクをコピー'}
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
                <p>番号: {detail?.loginId ?? '（未発行）'}</p>
                <p>
                  パスワード:{' '}
                  <span className="font-mono tracking-[0.2em]">
                    {detail?.issuedPassword ?? '（記録なし。PW再発行で作り直せます）'}
                  </span>
                </p>
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

          {/* 受付での聞き間違い直しや、SNSでの名前にそろえたいときに使う */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="renameInput">表示名を変える</Label>
            <div className="flex gap-2">
              <Input
                id="renameInput"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                maxLength={24}
                disabled={busy}
              />
              <Button
                variant="outline"
                onClick={() => void rename()}
                disabled={busy || !renameInput.trim() || renameInput.trim() === detail?.displayName}
              >
                変更
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              24文字まで。配ったQRカードとパスワードはそのまま使えます（名前だけ変わります）。
            </p>
            {renameError ? (
              <p role="alert" className="text-xs text-primary">
                {renameError}
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>閉じる</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
