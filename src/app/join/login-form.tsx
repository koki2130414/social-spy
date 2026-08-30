'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { participantLoginSchema, type ParticipantLoginValues } from '@/lib/validation';
import { apiSend, ApiError } from '@/lib/api';

/** 運営から受け取ったIDとパスワードで入る（受付で事前登録された人向け） */
export function ParticipantLoginForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ParticipantLoginValues>({
    resolver: zodResolver(participantLoginSchema),
    defaultValues: { code: initialCode, loginId: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apiSend('/api/participant/login', values);
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
        <Label htmlFor="login-code">EVENT CODE / イベントコード</Label>
        <Input
          id="login-code"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="例: SPY2026"
          className="font-mono text-lg tracking-[0.25em]"
          aria-invalid={Boolean(errors.code)}
          {...register('code')}
        />
        {errors.code ? <p className="text-xs text-primary">{errors.code.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-id">ID</Label>
        <Input
          id="login-id"
          autoCapitalize="none"
          autoComplete="username"
          placeholder="例: agent-7k4p"
          className="font-mono"
          aria-invalid={Boolean(errors.loginId)}
          {...register('loginId')}
        />
        {errors.loginId ? <p className="text-xs text-primary">{errors.loginId.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">PASSWORD / パスワード</Label>
        <Input
          id="login-password"
          type="password"
          autoCapitalize="none"
          autoComplete="current-password"
          placeholder="受付で渡されたパスワード"
          className="font-mono"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        {errors.password ? <p className="text-xs text-primary">{errors.password.message}</p> : null}
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
        {isSubmitting ? '照合中…' : 'ログインする'}
      </Button>
    </form>
  );
}
