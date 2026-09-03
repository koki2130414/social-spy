'use client';

import { useState } from 'react';
import { Copy, Loader2, ShieldCheck, ShieldOff, UserRoundPlus } from 'lucide-react';
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
import { useAdminResource } from '@/hooks/use-admin-resource';
import { apiSend, ApiError } from '@/lib/api';

interface Member {
  id: string;
  email: string;
  displayName: string;
  pending: boolean;
  managedEvents: number;
  isSelf: boolean;
}

export default function AdminMembersPage() {
  const { data, loading, error, refresh } = useAdminResource<{ members: Member[] }>(
    '/api/admin/members',
    15000,
  );
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Member | null>(null);
  const [issued, setIssued] = useState<{ email: string; setupUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const members = data?.members ?? [];

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await apiSend<{ email: string; alreadyExisted: boolean; setupUrl: string }>(
        '/api/admin/members',
        { email },
      );
      setIssued({ email: res.email, setupUrl: res.setupUrl });
      setNotice(
        res.alreadyExisted
          ? `${res.email} は既にアカウントがありました。運営権限を付け直しました。`
          : `${res.email} を運営メンバーに追加しました。`,
      );
      setEmail('');
      await refresh();
    } catch (e2) {
      setActionError(e2 instanceof ApiError ? e2.message : '追加できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const copySetupUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('コピーできませんでした。URLを長押しして選択してください。');
    }
  };

  const revoke = async (member: Member) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await apiSend(`/api/admin/members/${member.id}`, undefined, 'DELETE');
      setNotice(`${member.email} の運営権限を外しました。`);
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '権限を外せませんでした。');
    } finally {
      setBusy(false);
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="label-mono">運営メンバー</p>
        <h1 className="headline-mono mt-1 text-xl">管理画面に入れる人</h1>
      </header>

      {actionError ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {actionError}
        </p>
      ) : null}
      {notice ? (
        <p className="border border-intel/50 bg-intel/10 p-3 text-sm text-intel">{notice}</p>
      ) : null}

      <section className="rounded-sm border border-border bg-card p-5">
        <p className="label-mono">運営メンバーを追加</p>
        <p className="mt-1 text-xs text-muted-foreground">
          追加するとパスワード設定用のURLが表示されます。本人に渡してください（LINEやSlackで構いません）。
          パスワードは本人が決めるので、こちらで預かることはありません。
          追加した人は、現在のすべてのイベントを管理できます。
        </p>
        <form onSubmit={invite} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="member-email">メールアドレス</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例: staff@example.com"
              autoCapitalize="none"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !email.trim()} className="w-full sm:w-auto">
              <UserRoundPlus className="h-4 w-4" aria-hidden />
              追加する
            </Button>
          </div>
        </form>

        {issued ? (
          <div className="mt-4 space-y-2 rounded-sm border border-intel/50 bg-intel/10 p-3">
            <p className="text-sm text-intel">
              {issued.email} のパスワード設定URLです。
              <strong className="text-foreground">本人にだけ渡してください。</strong>
              7日間で期限切れになります。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-sm bg-background px-2 py-1 font-mono text-xs text-foreground">
                {issued.setupUrl}
              </code>
              <Button size="sm" variant="outline" onClick={() => copySetupUrl(issued.setupUrl)}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                {copied ? 'コピーしました' : 'コピー'}
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setIssued(null)}>
              閉じる
            </Button>
          </div>
        ) : null}
      </section>

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
                <TableHead>メールアドレス</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>管理イベント</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs text-foreground">
                    {m.email}
                    {m.isSelf ? (
                      <span className="ml-2 text-[10px] text-muted-foreground">（あなた）</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {m.pending ? (
                      <Badge variant="outline">パスワード未設定</Badge>
                    ) : (
                      <Badge variant="intel">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        有効
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-intel">{m.managedEvents}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || m.isSelf}
                      title={m.isSelf ? '自分自身の権限は外せません' : '運営権限を外す'}
                      onClick={() => setRevoking(m)}
                    >
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                      権限を外す
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    運営メンバーがいません。
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>運営権限を外しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.email} は管理画面にログインできなくなります。
              アカウント自体は残るので、あとから招待し直せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (revoking) void revoke(revoking);
              }}
              disabled={busy}
            >
              権限を外す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
