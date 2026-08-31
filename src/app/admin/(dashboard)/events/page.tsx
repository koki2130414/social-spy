'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Loader2, Plus, QrCode, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/components/spy/admin-shell';
import { apiGet, apiSend, ApiError } from '@/lib/api';
import { eventSchema, type EventFormValues } from '@/lib/validation';
import { isoToLocalInput, localInputToIso } from '@/lib/datetime';
import { generateEventCode } from '@/lib/utils';

interface QrData {
  joinUrl: string;
  dataUrl: string;
  code: string;
}

export default function AdminEventsPage() {
  const { events, eventId, event, setEventId, reloadEvents } = useAdmin();
  const [mode, setMode] = useState<'edit' | 'create'>('edit');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<QrData | null>(null);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: '',
      code: '',
      startsAt: '',
      durationMinutes: 90,
      spyRevealOffsetMinutes: 45,
      spyCount: 2,
      registrationOpen: true,
    },
  });
  const { register, handleSubmit, reset, setValue, watch, formState } = form;

  useEffect(() => {
    if (mode === 'edit' && event) {
      reset({
        name: event.name,
        code: event.code,
        startsAt: isoToLocalInput(event.startsAt),
        durationMinutes: event.durationMinutes,
        spyRevealOffsetMinutes: event.spyRevealOffsetMinutes,
        spyCount: event.spyCount,
        registrationOpen: event.registrationOpen,
      });
    }
  }, [event, mode, reset]);

  useEffect(() => {
    if (!eventId) {
      setQr(null);
      return;
    }
    let active = true;
    apiGet<QrData>(`/api/admin/events/${eventId}/qrcode`)
      .then((d) => active && setQr(d))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [eventId, event?.code]);

  const startCreate = () => {
    setMode('create');
    setMessage(null);
    setError(null);
    reset({
      name: '',
      code: generateEventCode(),
      startsAt: isoToLocalInput(new Date().toISOString()),
      durationMinutes: 90,
      spyRevealOffsetMinutes: 45,
      spyCount: 2,
      registrationOpen: true,
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setMessage(null);
    const payload = { ...values, startsAt: localInputToIso(values.startsAt) };
    try {
      if (mode === 'create') {
        const created = await apiSend<{ id: string }>('/api/admin/events', payload);
        await reloadEvents();
        setEventId(created.id);
        setMode('edit');
        setMessage('イベントを作成しました。');
      } else if (eventId) {
        await apiSend(`/api/admin/events/${eventId}`, payload, 'PATCH');
        await reloadEvents();
        setMessage('イベントを更新しました。');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '保存に失敗しました。');
    }
  });

  const registrationOpen = watch('registrationOpen');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">イベント設定</p>
          <h1 className="headline-mono mt-1 text-xl">開催日時とSPY人数</h1>
        </div>
        <Button variant="outline" onClick={startCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          新規作成
        </Button>
      </header>

      {events.length === 0 && mode === 'edit' ? (
        <p className="text-sm text-muted-foreground">
          イベントがありません。「新規作成」から作成してください。
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={onSubmit} className="space-y-5 rounded-sm border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Badge variant={mode === 'create' ? 'intel' : 'outline'}>
              {mode === 'create' ? 'NEW EVENT' : 'EDIT'}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">イベント名</Label>
              <Input id="name" {...register('name')} />
              {formState.errors.name ? (
                <p className="text-xs text-primary">{formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">イベントコード</Label>
              <div className="flex gap-2">
                <Input id="code" className="font-mono tracking-[0.2em]" {...register('code')} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="コードを自動生成"
                  onClick={() => setValue('code', generateEventCode(), { shouldDirty: true })}
                >
                  <QrCode className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              {formState.errors.code ? (
                <p className="text-xs text-primary">{formState.errors.code.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="startsAt">開催日時</Label>
              <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
              {formState.errors.startsAt ? (
                <p className="text-xs text-primary">{formState.errors.startsAt.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="durationMinutes">ゲーム時間（分）</Label>
              <Input id="durationMinutes" type="number" min={10} {...register('durationMinutes')} />
              {formState.errors.durationMinutes ? (
                <p className="text-xs text-primary">{formState.errors.durationMinutes.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="spyRevealOffsetMinutes">SPY MISSION公開タイミング（開始n分後）</Label>
              <Input
                id="spyRevealOffsetMinutes"
                type="number"
                min={0}
                {...register('spyRevealOffsetMinutes')}
              />
              <p className="text-xs text-muted-foreground">
                目安の表示用です。実際の公開は運営が手動で行います。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="spyCount">SPY人数</Label>
              <Input id="spyCount" type="number" min={0} {...register('spyCount')} />
              {formState.errors.spyCount ? (
                <p className="text-xs text-primary">{formState.errors.spyCount.message}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <div>
                <Label htmlFor="registrationOpen">受付状態</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  オフにすると新規参加を受け付けません。
                </p>
              </div>
              <Switch
                id="registrationOpen"
                checked={registrationOpen}
                onCheckedChange={(v) => setValue('registrationOpen', v, { shouldDirty: true })}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="border border-intel/50 bg-intel/10 p-3 text-sm text-intel">{message}</p>
          ) : null}

          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {mode === 'create' ? 'イベントを作成' : '変更を保存'}
          </Button>
        </form>

        <aside className="space-y-4 rounded-sm border border-border bg-card p-5">
          <p className="label-mono">参加用QR / URL</p>
          {qr ? (
            <>
              <div className="rounded-sm bg-white p-3">
                {/* データURLのQRコードはNext.jsの画像最適化を経由しないため img を使う */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr.dataUrl}
                  alt={`参加用QRコード（${qr.code}）`}
                  width={256}
                  height={256}
                  className="mx-auto h-auto w-full max-w-[256px]"
                />
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">{qr.joinUrl}</p>
              <Button asChild variant="outline" className="w-full">
                <a href={qr.dataUrl} download={`social-spy-${qr.code}.png`}>
                  <Download className="h-4 w-4" aria-hidden />
                  QRコードをダウンロード
                </a>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              イベントを選択するとQRコードを表示します。
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
