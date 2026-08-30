import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { SpyLogo } from '@/components/spy/logo';
import { JoinPanel } from './join-panel';

export const dynamic = 'force-dynamic';

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <header className="mb-8 space-y-3">
        <p className="label-mono">AGENT REGISTRATION</p>
        <SpyLogo />
        <p className="text-sm text-muted-foreground">
          受付で渡されたIDとパスワード、またはイベントコードで、情報員として入場してください。
        </p>
      </header>

      {error === 'invalid-link' ? (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            参加用リンクが無効でした。運営から渡されたIDとパスワードでログインしてください。
          </span>
        </div>
      ) : null}

      <JoinPanel
        initialCode={(code ?? '').toUpperCase()}
        scannedQr={Boolean(code) && error !== 'invalid-link'}
      />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        QRコードから開いた場合はコードが自動入力されます。
      </p>
      <p className="mt-2 text-center text-xs">
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          トップへ戻る
        </Link>
      </p>
    </main>
  );
}
