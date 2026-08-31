import { cn } from '@/lib/utils';

export function SpyLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2', className)} aria-label="BUZZ BASE">
      <span
        className={cn(
          'headline-mono leading-none text-foreground',
          compact ? 'text-base' : 'text-2xl sm:text-3xl',
        )}
      >
        BUZZ
      </span>
      <span
        className={cn(
          'headline-mono leading-none text-primary',
          compact ? 'text-base' : 'text-2xl sm:text-3xl',
        )}
      >
        BASE
      </span>
    </div>
  );
}
