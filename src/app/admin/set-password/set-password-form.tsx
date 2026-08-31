'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * 招待メール／パスワード再設定メールのリンク先。
 *
 * Supabase が発行するリンクは、設定によって渡し方が3通りある。
 * どれで来ても本人が続けられるよう、すべて受け取れるようにしている。
 *   1. ?code=...            （PKCE）
 *   2. ?token_hash=&type=   （メールリンクの新しい形式）
 *   3. #access_token=...    （URLハッシュ。detectSessionInUrl が処理する）
 *
 * パスワードは本人のブラウザから Supabase へ直接送る。
 * このアプリのサーバーを通さないので、平文がサーバーのログに残ることはない。
 */

type Phase = 'verifying' | 'ready' | 'invalid' | 'done';

export function SetPasswordForm({ url, anonKey }: { url: string; anonKey: string }) {
  const router = useRouter();
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [phase, setPhase] = useState<Phase>('verifying');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, detectSessionInUrl: true, flowType: 'pkce' },
    });
    setClient(supabase);

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash && type) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'invite' | 'recovery' | 'email',
          });
        }
        // ハッシュ形式は detectSessionInUrl が処理するので、ここでは結果だけ見る
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          setEmail(data.session.user.email ?? null);
          setPhase('ready');
          // トークンをURLに残さない
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          setPhase('invalid');
        }
      } catch {
        setPhase('invalid');
      }
    })();
  }, [url, anonKey]);

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
    if (!client) return;

    setBusy(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        setError('パスワードを設定できませんでした。もう一度お試しください。');
        return;
      }
      // このアプリのログインは別のセッションなので、Supabase側は閉じておく
      await client.auth.signOut();
      setPhase('done');
      setTimeout(() => router.replace('/admin/login'), 2500);
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'verifying') {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        リンクを確認しています…
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            リンクが無効か、有効期限が切れています。運営者に招待メールの再送を依頼してください。
          </span>
        </div>
        <Button variant="outline" className="w-full" onClick={() => router.replace('/admin/login')}>
          ログイン画面へ
        </Button>
      </div>
    );
  }

  if (phase === 'done') {
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
      {email ? (
        <div className="space-y-1">
          <p className="label-mono">ACCOUNT</p>
          <p className="font-mono text-sm text-foreground">{email}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="new-password">PASSWORD / パスワード（8文字以上）</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">CONFIRM / 確認のためもう一度</Label>
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
