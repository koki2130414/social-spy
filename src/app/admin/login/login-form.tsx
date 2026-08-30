'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminLoginSchema, type AdminLoginValues } from '@/lib/validation';
import { apiSend, ApiError } from '@/lib/api';

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await apiSend('/api/admin/login', values);
      router.replace('/admin');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ログインに失敗しました。');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">EMAIL</Label>
        <Input id="email" type="email" autoComplete="username" {...register('email')} />
        {errors.email ? <p className="text-xs text-primary">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">PASSWORD</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password ? <p className="text-xs text-primary">{errors.password.message}</p> : null}
      </div>

      {error ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        ログイン
      </Button>
    </form>
  );
}
