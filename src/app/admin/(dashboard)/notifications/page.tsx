'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/components/spy/admin-shell';
import { useAdminResource } from '@/hooks/use-admin-resource';
import { apiSend, ApiError } from '@/lib/api';
import { notificationSchema, type NotificationFormValues } from '@/lib/validation';
import { formatDateTime } from '@/lib/datetime';
import type { NotificationKind, SpyNotification } from '@/lib/types';

const PRESETS: Array<{ title: string; body: string; kind: NotificationKind }> = [
  { title: 'OPERATION START', body: '作戦を開始する。各自のMISSIONを遂行せよ。', kind: 'PHASE' },
  {
    title: 'CLASSIFIED INFORMATION',
    body: 'この会場には、諸君に紛れて秘密の任務を帯びたSPYが存在する。',
    kind: 'CLASSIFIED',
  },
  {
    title: 'SPY MISSION REVEALED',
    body: 'SPYに与えられていたMISSIONを公開する。',
    kind: 'CLASSIFIED',
  },
  { title: 'OPERATION TERMINATED', body: '作戦を終了する。投票へ移行せよ。', kind: 'ALERT' },
];

const KIND_VARIANT: Record<NotificationKind, 'default' | 'intel' | 'amber' | 'danger'> = {
  INFO: 'default',
  PHASE: 'intel',
  CLASSIFIED: 'amber',
  ALERT: 'danger',
};

export default function AdminNotificationsPage() {
  const { eventId } = useAdmin();
  const { data, loading, error, refresh } = useAdminResource<{ notifications: SpyNotification[] }>(
    eventId ? `/api/admin/events/${eventId}/notifications` : null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState } =
    useForm<NotificationFormValues>({
      resolver: zodResolver(notificationSchema),
      defaultValues: { title: '', body: '', kind: 'INFO' },
    });

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを選択してください。</p>;
  }

  const onSubmit = handleSubmit(async (values) => {
    setActionError(null);
    setMessage(null);
    try {
      await apiSend(`/api/admin/events/${eventId}/notifications`, values);
      reset({ title: '', body: '', kind: 'INFO' });
      setMessage('全参加者へ送信しました。');
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '送信に失敗しました。');
    }
  });

  const kind = watch('kind');

  return (
    <div className="space-y-6">
      <header>
        <p className="label-mono">全体通知</p>
        <h1 className="headline-mono mt-1 text-xl">参加者全員へのお知らせ</h1>
      </header>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="h-fit space-y-4 rounded-sm border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="n-title">タイトル</Label>
            <Input id="n-title" placeholder="OPERATION START" {...register('title')} />
            {formState.errors.title ? (
              <p className="text-xs text-primary">{formState.errors.title.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="n-body">本文</Label>
            <Textarea id="n-body" {...register('body')} />
            {formState.errors.body ? (
              <p className="text-xs text-primary">{formState.errors.body.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="n-kind">種類</Label>
            <select
              id="n-kind"
              value={kind}
              onChange={(e) => setValue('kind', e.target.value as NotificationKind)}
              className="min-h-[48px] w-full rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="INFO">INFO（お知らせ）</option>
              <option value="PHASE">PHASE（進行）</option>
              <option value="CLASSIFIED">CLASSIFIED（機密）</option>
              <option value="ALERT">ALERT（警告）</option>
            </select>
          </div>

          <div className="space-y-2">
            <p className="label-mono">テンプレート</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.title}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setValue('title', p.title);
                    setValue('body', p.body);
                    setValue('kind', p.kind);
                  }}
                >
                  {p.title}
                </Button>
              ))}
            </div>
          </div>

          {actionError ? (
            <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
              {actionError}
            </p>
          ) : null}
          {message ? (
            <p className="border border-intel/50 bg-intel/10 p-3 text-sm text-intel">{message}</p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            全参加者へ送信
          </Button>
        </form>

        <section>
          <p className="label-mono mb-3">送信履歴</p>
          {loading && !data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
            </div>
          ) : error ? (
            <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
              {error}
            </p>
          ) : (
            <ul className="space-y-2">
              {(data?.notifications ?? []).map((n) => (
                <li key={n.id} className="rounded-sm border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_VARIANT[n.kind]}>{n.kind}</Badge>
                    <span className="headline-mono text-sm text-foreground">{n.title}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{n.body}</p>
                </li>
              ))}
              {(data?.notifications ?? []).length === 0 ? (
                <li className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
                  送信履歴はありません。
                </li>
              ) : null}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
