import Link from 'next/link';
import { Fingerprint, ScanEye, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { IntroGate } from '@/components/spy/intro-gate';
import { isDemoModeEnabled } from '@/lib/env';

/**
 * このページは配信網から直接返す（静的）。
 *
 * 参加者が最初に開く画面なので、ここだけはサーバーを起こさずに返したい。
 * リクエストごとに変わる情報は使っておらず、デモ表示の判定も環境変数だけなので、
 * ビルド時に確定できる。実測で 218ms → 27ms。
 *
 * リクエストの中身（Cookie・検索文字列・ヘッダ）を読む処理を足すと
 * 自動的に動的へ戻り、この速さは失われる。足すなら別のページか、
 * 画面が出たあとにブラウザ側から取りに行くこと。
 */
export const dynamic = 'force-static';

export default function HomePage() {
  const demo = isDemoModeEnabled();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-between px-4 py-10">
      <div className="space-y-8">
        <header className="space-y-3">
          <p className="label-mono">CLASSIFIED / LEVEL 4</p>
          <SpyLogo />
          <p className="text-sm text-muted-foreground">交流を、ゲームにする。</p>
          <IntroGate />
        </header>

        <ClassifiedPanel className="p-5" stamp="CLASSIFIED" tone="danger">
          <p className="headline-mono text-lg leading-relaxed text-foreground">
            交流会は、
            <br />
            すでに諜報戦になっている。
          </p>
          <div className="hairline my-4" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            参加者は全員「情報員」。しかしその中には、秘密の任務を帯びた SPY が紛れている。 MISSION
            を遂行しながら、SPY を見つけ出せ。
          </p>
        </ClassifiedPanel>

        <ul className="space-y-3">
          {[
            { icon: Fingerprint, label: 'MISSIONを受け取り、人と話す' },
            { icon: ScanEye, label: '後半、SPY MISSIONが公開される' },
            { icon: ShieldAlert, label: 'FINAL VOTEでSPYを指名する' },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-foreground/85">
              <Icon className="h-4 w-4 shrink-0 text-intel" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="safe-bottom mt-10 space-y-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/join">参加する / JOIN</Link>
        </Button>
        {demo ? (
          <Button asChild variant="intel" size="lg" className="w-full">
            <Link href="/demo">デモを試す / DEMO</Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="default" className="w-full">
          <Link href="/admin/login">運営者ログイン</Link>
        </Button>
      </div>
    </main>
  );
}
