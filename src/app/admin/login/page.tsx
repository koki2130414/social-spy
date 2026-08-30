import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { getAdminSession } from '@/server/auth/session';
import { appMode, demoAdminCredentials, isDemoModeEnabled } from '@/lib/env';
import { AdminLoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect('/admin');

  const demo = isDemoModeEnabled() && appMode() === 'demo';
  const creds = demoAdminCredentials();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-14">
      <header className="mb-8 space-y-3">
        <p className="label-mono">RESTRICTED AREA</p>
        <SpyLogo />
        <p className="text-sm text-muted-foreground">運営者専用の管理コンソールです。</p>
      </header>

      <ClassifiedPanel className="p-5" tone="danger" stamp="AUTH">
        <AdminLoginForm />
      </ClassifiedPanel>

      {demo ? (
        <div className="mt-6 space-y-1 rounded-sm border border-dashed border-border p-4 text-xs">
          <p className="label-mono">DEMO CREDENTIALS</p>
          <p className="font-mono text-foreground/80">{creds.email}</p>
          <p className="font-mono text-foreground/80">{creds.password}</p>
        </div>
      ) : null}

      <p className="mt-8 text-center text-xs">
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          トップへ戻る
        </Link>
      </p>
    </main>
  );
}
