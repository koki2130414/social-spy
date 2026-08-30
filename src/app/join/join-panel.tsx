'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { JoinForm } from './join-form';
import { ParticipantLoginForm } from './login-form';

type Mode = 'login' | 'register';

/**
 * 参加者の入口。
 *
 * 受付で事前登録された人はIDとパスワード、その場で参加する人は新規登録を使う。
 * 初期表示は来かたで決める。会場のQRコードから来た人（コードが自動入力されている）は
 * その場で登録したい人なので登録タブ、それ以外はIDを渡されている人とみなしてログインタブ。
 */
export function JoinPanel({ initialCode, scannedQr }: { initialCode: string; scannedQr: boolean }) {
  const [mode, setMode] = useState<Mode>(scannedQr ? 'register' : 'login');

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cn(
        'min-h-[44px] flex-1 rounded-sm border px-3 text-sm transition-colors',
        mode === value
          ? 'border-intel bg-intel/15 text-intel'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tab('login', 'IDでログイン')}
        {tab('register', 'その場で登録')}
      </div>

      <ClassifiedPanel className="p-5" tone="intel">
        {mode === 'login' ? (
          <ParticipantLoginForm initialCode={initialCode} />
        ) : (
          <JoinForm initialCode={initialCode} />
        )}
      </ClassifiedPanel>

      <p className="text-xs text-muted-foreground">
        {mode === 'login'
          ? '受付で渡されたIDとパスワードを入力してください。'
          : 'IDを受け取っていない場合は、こちらから登録できます。'}
      </p>
    </div>
  );
}
