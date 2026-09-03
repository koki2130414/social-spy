'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiSend, ApiError } from '@/lib/api';

/**
 * 運営者が自分のパスワードを決める画面。
 *
 * 運営メンバー画面で発行されたリンク（?t=署名付きトークン）から開く。
 * トークンの検証とパスワードの保存はサーバー側で行い、
 * 平文パスワードはこの1回のリクエスト以外どこにも残さない。
 */
export function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください。');
      return;
    }
    if (password !== confirm) {
      setError('確認用のパスワードが一致しません。');
      return;
    }

    setBusy(true);
    try {
      await apiSend('/api/admin/setup-password', { token, password });
      setDone(true);
      setTimeout(() => router.replace('/admin/login'), 2500);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : '通信に失敗しました。時間をおいて再試行してください。',
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-intel">パスワードを設定しました。ログイン画面へ移動します。</p>
        <Button variant="outline" className="w-full" onClick={() => router.replace('/admin/login')}>
          今すぐログインする
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="new-password">パスワード（8文字以上）</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">確認のためもう一度</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {busy ? '設定中…' : 'パスワードを設定する'}
      </Button>
    </form>
  );
}
