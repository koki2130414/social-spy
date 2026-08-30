import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/spy/admin-shell';
import { getAdminSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');

  return <AdminShell adminName={session.name}>{children}</AdminShell>;
}
