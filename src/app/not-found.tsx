import Link from 'next/link';
import { SpyLogo } from '@/components/spy/logo';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <SpyLogo />
      <p className="headline-mono text-sm text-muted-foreground">404 / NO SUCH FILE</p>
      <p className="text-sm text-muted-foreground">
        指定された情報は存在しないか、閲覧権限がありません。
      </p>
      <Link href="/" className="headline-mono text-sm text-intel underline underline-offset-4">
        トップへ戻る
      </Link>
    </main>
  );
}
