'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReloadButton() {
  return (
    <Button size="lg" className="mt-6 w-full" onClick={() => window.location.reload()}>
      <RotateCw className="h-4 w-4" aria-hidden />
      再接続する
    </Button>
  );
}
