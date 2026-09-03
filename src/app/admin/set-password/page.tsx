import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { SetPasswordForm } from './set-password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'パスワードの設定' };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

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
        {t ? (
          <SetPasswordForm token={t} />
        ) : (
          <div
            role="alert"
            className="flex items-start gap-2 border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              このページは、運営者から渡されたパスワード設定リンクから開いてください。
              リンクが見つからない場合は再発行を依頼してください。
            </span>
          </div>
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
