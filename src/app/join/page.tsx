import Link from 'next/link';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { JoinForm } from './join-form';

export const dynamic = 'force-dynamic';

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <header className="mb-8 space-y-3">
        <p className="label-mono">AGENT REGISTRATION</p>
        <SpyLogo />
        <p className="text-sm text-muted-foreground">
          イベントコードを入力して、情報員として登録してください。
        </p>
      </header>

      <ClassifiedPanel className="p-5" tone="intel">
        <JoinForm initialCode={(code ?? '').toUpperCase()} />
      </ClassifiedPanel>

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
