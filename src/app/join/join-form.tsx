'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { joinSchema, type JoinFormValues } from '@/lib/validation';
import { apiSend, ApiError } from '@/lib/api';

export function JoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinFormValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: { code: initialCode, displayName: '', affiliation: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiSend('/api/participant/join', values);
      router.replace('/game');
      router.refresh();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : '通信に失敗しました。時間をおいて再試行してください。',
      );
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">EVENT CODE / イベントコード</Label>
        <Input
          id="code"
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          placeholder="例: SPY2026"
          className="font-mono text-lg tracking-[0.25em]"
          aria-invalid={Boolean(errors.code)}
          aria-describedby={errors.code ? 'code-error' : undefined}
          {...register('code')}
        />
        {errors.code ? (
          <p id="code-error" className="text-xs text-primary">
            {errors.code.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">DISPLAY NAME / 表示名</Label>
        <Input
          id="displayName"
          autoComplete="nickname"
          placeholder="例: 佐藤 悠真"
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={errors.displayName ? 'name-error' : undefined}
          {...register('displayName')}
        />
        {errors.displayName ? (
          <p id="name-error" className="text-xs text-primary">
            {errors.displayName.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="affiliation">AFFILIATION / 所属・肩書き（任意）</Label>
        <Input
          id="affiliation"
          autoComplete="organization"
          placeholder="例: フリーランス / Webデザイナー"
          {...register('affiliation')}
        />
        {errors.affiliation ? (
          <p className="text-xs text-primary">{errors.affiliation.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 border border-primary/50 bg-primary/10 p-3 text-sm text-primary"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {isSubmitting ? '照合中…' : '参加する'}
      </Button>
    </form>
  );
}
