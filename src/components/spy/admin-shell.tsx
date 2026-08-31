'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  CalendarCog,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpyLogo } from '@/components/spy/logo';
import { apiGet, apiSend, ApiError } from '@/lib/api';
import type { SpyEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'social-spy.admin.eventId';

interface AdminContextValue {
  events: SpyEvent[];
  eventId: string | null;
  event: SpyEvent | null;
  setEventId: (id: string) => void;
  reloadEvents: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminShell');
  return ctx;
}

const NAV = [
  { href: '/admin', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/admin/events', label: 'イベント設定', icon: CalendarCog },
  { href: '/admin/participants', label: '参加者', icon: Users },
  { href: '/admin/missions', label: 'MISSION', icon: ClipboardList },
  { href: '/admin/notifications', label: '全体通知', icon: Bell },
  { href: '/admin/results', label: '投票結果', icon: BarChart3 },
  { href: '/admin/members', label: '運営メンバー', icon: ShieldCheck },
];

export function AdminShell({
  children,
  adminName,
}: {
  children: React.ReactNode;
  adminName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [events, setEvents] = useState<SpyEvent[]>([]);
  const [eventId, setEventIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadEvents = useCallback(async () => {
    try {
      const res = await apiGet<{ events: SpyEvent[] }>('/api/admin/events');
      setEvents(res.events);
      setEventIdState((current) => {
        if (current && res.events.some((e) => e.id === current)) return current;
        const stored =
          typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (stored && res.events.some((e) => e.id === stored)) return stored;
        return res.events[0]?.id ?? null;
      });
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(e instanceof ApiError ? e.message : 'イベントを取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reloadEvents();
  }, [reloadEvents]);

  const setEventId = useCallback((id: string) => {
    setEventIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* localStorage が使えない環境は無視 */
    }
  }, []);

  const logout = async () => {
    await apiSend('/api/admin/logout');
    router.replace('/admin/login');
  };

  const event = events.find((e) => e.id === eventId) ?? null;

  return (
    <AdminContext.Provider value={{ events, eventId, event, setEventId, reloadEvents }}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        {/* サイドバー（デスクトップ）/ 上部ナビ（モバイル） */}
        <aside className="border-b border-border bg-card lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between p-4 lg:block">
            <div>
              <SpyLogo compact />
              <p className="label-mono mt-1">運営コンソール</p>
            </div>
            <Badge variant="outline" className="lg:mt-3">
              {adminName}
            </Badge>
          </div>

          <nav aria-label="管理ナビゲーション" className="overflow-x-auto px-2 pb-3">
            <ul className="flex gap-1 lg:flex-col">
              {NAV.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[44px] items-center gap-2 rounded-sm px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors',
                        active
                          ? 'bg-intel/15 text-intel'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden p-3 lg:block">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
              <LogOut className="h-4 w-4" aria-hidden />
              ログアウト
            </Button>
          </div>
        </aside>

        <div className="flex-1">
          {/* イベント選択 */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3">
            <label htmlFor="admin-event" className="label-mono">
              イベント
            </label>
            <select
              id="admin-event"
              value={eventId ?? ''}
              onChange={(e) => setEventId(e.target.value)}
              className="min-h-[44px] flex-1 rounded-sm border border-input bg-background px-3 text-sm sm:min-w-[280px] sm:flex-none"
            >
              {events.length === 0 ? <option value="">（イベントがありません）</option> : null}
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}（{e.code}）
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={logout}>
              <LogOut className="h-4 w-4" aria-hidden />
              ログアウト
            </Button>
          </div>

          <main className="p-4 sm:p-6">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2
                  className="h-6 w-6 animate-spin text-muted-foreground"
                  aria-label="読み込み中"
                />
              </div>
            ) : error ? (
              <p
                role="alert"
                className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
              >
                {error}
              </p>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
