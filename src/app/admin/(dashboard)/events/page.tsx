'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Archive,
  ArchiveRestore,
  Download,
  Loader2,
  Plus,
  QrCode,
  Save,
  Trash2,
} from 'lucide-react';
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
import { formatDateTime } from '@/lib/datetime';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import type { SpyEvent } from '@/lib/types';

interface EventSummary extends SpyEvent {
  participantCount: number;
  voteCount: number;
}

const PHASE_LABEL: Record<string, string> = {
  LOBBY: '受付中',
  ACTIVE: '進行中',
  SPY_MISSION_REVEALED: 'SPY公開',
  VOTING: '投票中',
  IDENTITY_REVEALED: '正体公開',
  FINISHED: '終了',
};

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
  // 過去のイベントも含めた一覧（管理用）
  const [summaries, setSummaries] = useState<EventSummary[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EventSummary | null>(null);
  const [typedCode, setTypedCode] = useState('');

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: '',
      code: '',
      startsAt: '',
      durationMinutes: 90,
      spyRevealOffsetMinutes: 45,
      spyCount: 2,
      spyMissionPublic: true,
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
        spyMissionPublic: event.spyMissionPublic,
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

  /** 一覧を取り直す。人数と投票数も一緒に来る */
  const reloadSummaries = async () => {
    try {
      const res = await apiGet<{ events: EventSummary[] }>('/api/admin/events?summary=1');
      setSummaries(res.events);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'イベント一覧を取得できませんでした。');
    }
  };

  useEffect(() => {
    void reloadSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** しまう／戻す。記録は消えない */
  const toggleArchive = async (row: EventSummary) => {
    setBusyId(row.id);
    setError(null);
    try {
      await apiSend(
        `/api/admin/events/${row.id}/archive`,
        { archived: row.archivedAt === null },
        'PATCH',
      );
      await Promise.all([reloadSummaries(), reloadEvents()]);
      setMessage(row.archivedAt === null ? 'イベントをしまいました。' : 'イベントを戻しました。');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '変更できませんでした。');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * イベントを消す。
   *
   * 参加者ごと消えるので、確認ダイアログでイベントコードを打ってもらう。
   * 投票が入っているイベントはサーバー側が断る（記録を守るため）。
   */
  const removeEvent = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    setError(null);
    try {
      await apiSend(`/api/admin/events/${confirmDelete.id}`, undefined, 'DELETE');
      await Promise.all([reloadSummaries(), reloadEvents()]);
      setMessage(`「${confirmDelete.name}」を削除しました。`);
      setConfirmDelete(null);
      setTypedCode('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除できませんでした。');
    } finally {
      setBusyId(null);
    }
  };

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
      spyMissionPublic: true,
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
  const spyMissionPublic = watch('spyMissionPublic');

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

      {/* イベント一覧（過去のものも含む） */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label-mono">イベント一覧</p>
          <Button size="sm" variant="outline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'しまったものを隠す' : 'しまったものも表示'}
          </Button>
        </div>
        <div className="rounded-sm border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>イベント名</TableHead>
                <TableHead>コード</TableHead>
                <TableHead>開催日時</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>参加者</TableHead>
                <TableHead>投票</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summaries ?? [])
                .filter((row) => showArchived || row.archivedAt === null)
                .map((row) => (
                  <TableRow key={row.id} className={row.id === eventId ? 'bg-intel/10' : undefined}>
                    <TableCell className="text-foreground">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setEventId(row.id)}
                        title="このイベントを選ぶ"
                      >
                        {row.name}
                      </button>
                      {row.archivedAt ? (
                        <Badge variant="outline" className="ml-2">
                          しまってある
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">{row.code}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.startsAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.phase === 'FINISHED' ? 'outline' : 'intel'}>
                        {PHASE_LABEL[row.phase] ?? row.phase}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-foreground">
                      {row.participantCount}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-muted-foreground">
                      {row.voteCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          onClick={() => void toggleArchive(row)}
                          title={
                            row.archivedAt
                              ? '一覧の手前に戻す'
                              : '終わったイベントをしまう（記録は消えません）'
                          }
                        >
                          {row.archivedAt ? (
                            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Archive className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {row.archivedAt ? '戻す' : 'しまう'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id || row.voteCount > 0}
                          onClick={() => {
                            setConfirmDelete(row);
                            setTypedCode('');
                          }}
                          title={
                            row.voteCount > 0
                              ? '投票が入っているイベントは削除できません（しまうを使ってください）'
                              : 'このイベントを完全に削除する'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              {summaries === null ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    読み込み中…
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          投票が入ったイベントは削除できません。記録を残すため「しまう」で一覧から外してください。
        </p>
      </section>

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
                <Label htmlFor="spyMissionPublic">SPY MISSIONを全員に公開する</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  オンにすると「SPY MISSION公開」以降、全員がSPY MISSIONの内容を読めます
                  （誰がSPYかは分かりません）。オフにすると、進行が進んでもSPY本人以外には出しません。
                  ヒント無しで探す進行にしたいときはオフにしてください。
                </p>
              </div>
              <Switch
                id="spyMissionPublic"
                checked={spyMissionPublic}
                onCheckedChange={(v) => setValue('spyMissionPublic', v, { shouldDirty: true })}
              />
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
            <p
              role="alert"
              className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
            >
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

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDelete(null);
            setTypedCode('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>「{confirmDelete?.name}」を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm">
                <p>
                  参加者 {confirmDelete?.participantCount} 名と、配ったQR・番号・パスワード、
                  MISSIONの達成状況が<strong className="text-foreground">すべて消えます</strong>。
                  元には戻せません。
                </p>
                <p>
                  残しておきたい場合は「しまう」を使ってください（一覧から外れるだけで、記録は残ります）。
                </p>
                <div className="space-y-1 pt-2">
                  <Label htmlFor="confirm-code">
                    確認のため、イベントコード
                    <span className="font-mono text-foreground"> {confirmDelete?.code} </span>
                    を入力してください
                  </Label>
                  <Input
                    id="confirm-code"
                    value={typedCode}
                    onChange={(e) => setTypedCode(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void removeEvent();
              }}
              disabled={busyId !== null || typedCode.trim() !== confirmDelete?.code}
            >
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              完全に削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
