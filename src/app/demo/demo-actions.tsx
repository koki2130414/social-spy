'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, ShieldQuestion, UserRound, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiSend, ApiError } from '@/lib/api';

type Persona = 'agent' | 'spy' | 'admin';

const PERSONAS: Array<{
  persona: Persona;
  label: string;
  description: string;
  icon: typeof UserRound;
  variant: 'intel' | 'default' | 'outline';
}> = [
  {
    persona: 'agent',
    label: '一般参加者として確認',
    description: '佐藤 悠真 / 一般の情報員。SPY情報は公開されるまで見えません。',
    icon: UserRound,
    variant: 'intel',
  },
  {
    persona: 'spy',
    label: 'SPYとして確認',
    description: '鈴木 玲奈 / SPY本人。自分専用のMISSIONが見えます。',
    icon: ShieldQuestion,
    variant: 'default',
  },
  {
    persona: 'admin',
    label: '管理者として確認',
    description: 'ゲームのフェーズ進行、参加者管理、投票結果を操作できます。',
    icon: Wrench,
    variant: 'outline',
  },
];

export function DemoActions() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = async (persona: Persona) => {
    setPending(persona);
    setError(null);
    try {
      const res = await apiSend<{ redirect: string }>('/api/demo/enter', { persona });
      router.push(res.redirect);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '切り替えに失敗しました。');
      setPending(null);
    }
  };

  const reset = async () => {
    setPending('reset');
    setError(null);
    try {
      await apiSend('/api/demo/reset');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'リセットに失敗しました。');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {PERSONAS.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.persona} className="rounded-sm border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="headline-mono text-sm">{p.label}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              <Button
                className="mt-3 w-full"
                variant={p.variant}
                disabled={pending !== null}
                onClick={() => enter(p.persona)}
              >
                {pending === p.persona ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                この視点で開く
              </Button>
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" className="w-full" disabled={pending !== null} onClick={reset}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        デモデータをリセット
      </Button>
    </div>
  );
}
