import Link from 'next/link';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { supabaseConfig } from '@/lib/env';
import { SetPasswordForm } from './set-password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'パスワードの設定' };

export default function SetPasswordPage() {
  // どちらも NEXT_PUBLIC_ の公開値。ブラウザへ渡してよい
  const { url, anonKey } = supabaseConfig();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-14">
      <header className="mb-8 space-y-3">
        <p className="label-mono">パスワードの設定</p>
        <SpyLogo />
        <p className="text-sm text-muted-foreground">
          運営者アカウントのパスワードを設定してください。
        </p>
      </header>

      <ClassifiedPanel className="p-5" tone="intel">
        {url && anonKey ? (
          <SetPasswordForm url={url} anonKey={anonKey} />
        ) : (
          <p className="text-sm text-primary">
            この環境ではパスワード設定を利用できません（Supabaseが未設定です）。
          </p>
        )}
      </ClassifiedPanel>

      <p className="mt-8 text-center text-xs">
        <Link href="/admin/login" className="text-muted-foreground underline underline-offset-4">
          ログイン画面へ
        </Link>
      </p>
    </main>
  );
}
