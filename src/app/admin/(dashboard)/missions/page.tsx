'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdmin } from '@/components/spy/admin-shell';
import { useAdminResource } from '@/hooks/use-admin-resource';
import { apiSend, ApiError } from '@/lib/api';
import { missionSchema, type MissionFormValues } from '@/lib/validation';
import type { Mission } from '@/lib/types';

const EMPTY: MissionFormValues = {
  code: '',
  title: '',
  body: '',
  kind: 'GENERAL',
  active: true,
};

export default function AdminMissionsPage() {
  const { eventId } = useAdmin();
  const { data, loading, error, refresh } = useAdminResource<{ missions: Mission[] }>(
    eventId ? `/api/admin/events/${eventId}/missions` : null,
  );
  const [editing, setEditing] = useState<Mission | null>(null);
  const [deleting, setDeleting] = useState<Mission | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (editing) {
      reset({
        code: editing.code,
        title: editing.title,
        body: editing.body,
        kind: editing.kind,
        active: editing.active,
      });
    } else {
      reset(EMPTY);
    }
  }, [editing, reset]);

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを選択してください。</p>;
  }

  const onSubmit = handleSubmit(async (values) => {
    setActionError(null);
    setMessage(null);
    try {
      if (editing) {
        await apiSend(`/api/admin/events/${eventId}/missions/${editing.id}`, values, 'PATCH');
        setMessage('MISSIONを更新しました。');
      } else {
        await apiSend(`/api/admin/events/${eventId}/missions`, values);
        setMessage('MISSIONを追加しました。');
      }
      setEditing(null);
      reset(EMPTY);
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '保存に失敗しました。');
    }
  });

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiSend(`/api/admin/events/${eventId}/missions/${deleting.id}`, undefined, 'DELETE');
      await refresh();
      setMessage('MISSIONを削除しました。');
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '削除に失敗しました。');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const distribute = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiSend<{ assigned: number }>(
        `/api/admin/events/${eventId}/missions/distribute`,
      );
      setMessage(`${res.assigned}名へ新たにMISSIONを配布しました。`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '配布に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const missions = data?.missions ?? [];
  const general = missions.filter((m) => m.kind === 'GENERAL');
  const spy = missions.filter((m) => m.kind === 'SPY');
  const kind = watch('kind');
  const active = watch('active');

  const renderList = (list: Mission[], title: string, tone: 'general' | 'spy') => (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <p className="label-mono">{title}</p>
        <Badge variant={tone === 'spy' ? 'danger' : 'outline'}>{list.length}</Badge>
      </div>
      <ul className="space-y-2">
        {list.map((m) => (
          <li key={m.id} className="rounded-sm border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={`headline-mono text-sm ${tone === 'spy' ? 'text-primary' : 'text-amber'}`}
                >
                  {m.code}
                </p>
                <p className="mt-1 text-sm text-foreground">{m.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{m.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.active ? (
                  <Badge variant="intel">有効</Badge>
                ) : (
                  <Badge variant="outline">無効</Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  編集
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(m)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  削除
                </Button>
              </div>
            </div>
          </li>
        ))}
        {list.length === 0 ? (
          <li className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            登録されていません。
          </li>
        ) : null}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">MISSIONS</p>
          <h1 className="headline-mono mt-1 text-xl">MISSION管理</h1>
        </div>
        <Button variant="intel" disabled={busy} onClick={distribute}>
          <Send className="h-4 w-4" aria-hidden />
          未配布の参加者へ3件ずつ配布
        </Button>
      </header>

      {actionError ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {actionError}
        </p>
      ) : null}
      {message ? (
        <p className="border border-intel/50 bg-intel/10 p-3 text-sm text-intel">{message}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {loading && !data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
            </div>
          ) : error ? (
            <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
              {error}
            </p>
          ) : (
            <>
              {renderList(general, '一般MISSION', 'general')}
              {renderList(spy, 'SPY MISSION', 'spy')}
            </>
          )}
        </div>

        <form onSubmit={onSubmit} className="h-fit space-y-4 rounded-sm border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="label-mono">{editing ? 'EDIT MISSION' : 'NEW MISSION'}</p>
            {editing ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                新規に切替
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-code">英字コード</Label>
            <Input id="m-code" placeholder="SNS EXCHANGE" {...register('code')} />
            {formState.errors.code ? (
              <p className="text-xs text-primary">{formState.errors.code.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-title">タイトル</Label>
            <Input id="m-title" placeholder="SNS交換" {...register('title')} />
            {formState.errors.title ? (
              <p className="text-xs text-primary">{formState.errors.title.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-body">内容</Label>
            <Textarea id="m-body" placeholder="3人の参加者とSNSを交換せよ。" {...register('body')} />
            {formState.errors.body ? (
              <p className="text-xs text-primary">{formState.errors.body.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-kind">対象ロール</Label>
            <select
              id="m-kind"
              value={kind}
              onChange={(e) => setValue('kind', e.target.value as 'GENERAL' | 'SPY')}
              className="min-h-[48px] w-full rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="GENERAL">一般参加者（GENERAL）</option>
              <option value="SPY">SPY専用（SPY）</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="m-active">有効</Label>
            <Switch
              id="m-active"
              checked={active}
              onCheckedChange={(v) => setValue('active', v)}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            {editing ? '更新する' : '追加する'}
          </Button>
        </form>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>MISSIONを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleting?.code}」を削除します。参加者への割り当ても解除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              disabled={busy}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
