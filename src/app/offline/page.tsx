import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { ReloadButton } from './reload-button';

export const metadata = { title: 'オフライン | SOCIAL SPY' };

/** Service Worker がオフライン時に返すフォールバック。静的に生成する */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <header className="mb-6 space-y-3">
        <p className="label-mono">Signal Lost</p>
        <SpyLogo />
      </header>

      <ClassifiedPanel className="p-6" tone="amber">
        <p className="headline-mono text-base text-amber">通信が届いていません</p>
        <div className="hairline my-4" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          会場の電波が不安定なようです。アプリは閉じずにそのままお待ちください。
          電波が戻ると自動的に再接続します。
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          <li>・記録したMISSIONの達成は端末に保持され、復帰後に自動送信されます</li>
          <li>・投票は電波が戻ってから行ってください</li>
        </ul>
      </ClassifiedPanel>

      <ReloadButton />
    </main>
  );
}
