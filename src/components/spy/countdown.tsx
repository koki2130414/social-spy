'use client';

import { useEffect, useState } from 'react';
import { formatRemaining, remainingMs } from '@/lib/core/phase';

export function Countdown({
  activeStartedAt,
  durationMinutes,
  className,
}: {
  activeStartedAt: string | null;
  durationMinutes: number;
  className?: string;
}) {
  const [ms, setMs] = useState<number | null>(() =>
    remainingMs(activeStartedAt, durationMinutes),
  );

  useEffect(() => {
    setMs(remainingMs(activeStartedAt, durationMinutes));
    const id = setInterval(() => setMs(remainingMs(activeStartedAt, durationMinutes)), 1000);
    return () => clearInterval(id);
  }, [activeStartedAt, durationMinutes]);

  return (
    <span className={className} suppressHydrationWarning>
      {activeStartedAt ? formatRemaining(ms) : '--:--'}
    </span>
  );
}
