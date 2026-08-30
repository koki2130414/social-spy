import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { appMode, demoAdminCredentials, isDemoModeEnabled } from '@/lib/env';
import { DEMO_EVENT_CODE } from '@/server/demo/seed';
import { DemoActions } from './demo-actions';

export const dynamic = 'force-dynamic';

export default function DemoPage() {
  if (!isDemoModeEnabled() || appMode() !== 'demo') notFound();
  const creds = demoAdminCredentials();

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <header className="mb-6 space-y-3">
        <p className="label-mono">DEMO MODE</p>
        <SpyLogo />
        <p className="text-sm text-muted-foreground">
          Supabaseを設定しなくても、参加者側と管理者側の主要フローを確認できます。
        </p>
      </header>

      <ClassifiedPanel className="mb-6 p-4" tone="amber" stamp="SAMPLE">
        <p className="label-mono">デモイベント</p>
        <p className="mt-2 text-base text-foreground">CROSS TALK NIGHT vol.7</p>
        <p className="mt-1 text-sm text-muted-foreground">
          参加者12名 / SPY 2名 / イベントコード{' '}
          <span className="font-mono text-amber">{DEMO_EVENT_CODE}</span>
        </p>
      </ClassifiedPanel>

      <DemoActions />

      <section className="mt-8 space-y-2 rounded-sm border border-dashed border-border p-4">
        <p className="label-mono">管理者デモログイン</p>
        <p className="font-mono text-xs text-foreground/80">{creds.email}</p>
        <p className="font-mono text-xs text-foreground/80">{creds.password}</p>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/login" className="underline underline-offset-4">
            /admin/login
          </Link>{' '}
          からも同じ資格情報でログインできます。
        </p>
      </section>

      <section className="mt-6 space-y-2 text-xs text-muted-foreground">
        <p className="label-mono">おすすめの確認手順</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「管理者として確認」→ ゲーム開始（OPERATION START）</li>
          <li>別タブで「一般参加者として確認」→ MISSIONを達成</li>
          <li>管理者に戻り SPY MISSION公開 → 参加者側 INTEL が切り替わる</li>
          <li>投票開始 → 参加者側で FINAL VOTE</li>
          <li>正体公開 → 参加者側 RESULT で結果を確認</li>
        </ol>
      </section>

      <p className="mt-8 text-center text-xs">
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          トップへ戻る
        </Link>
      </p>
    </main>
  );
}
