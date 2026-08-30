import { cn } from '@/lib/utils';

/** 機密文書風のパネル。角のマーカーと控えめな走査線を持つ */
export function ClassifiedPanel({
  children,
  className,
  stamp,
  tone = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  stamp?: string;
  tone?: 'default' | 'danger' | 'intel' | 'amber';
}) {
  const toneClass = {
    default: 'border-border',
    danger: 'border-primary/50',
    intel: 'border-intel/50',
    amber: 'border-amber/50',
  }[tone];

  const stampTone = {
    default: 'border-muted-foreground text-muted-foreground',
    danger: 'border-primary text-primary',
    intel: 'border-intel text-intel',
    amber: 'border-amber text-amber',
  }[tone];

  return (
    <div className={cn('scanlines relative overflow-hidden border bg-card', toneClass, className)}>
      {stamp ? (
        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <span className={cn('stamp', stampTone)}>{stamp}</span>
        </div>
      ) : null}
      <div className="relative z-0">{children}</div>
    </div>
  );
}
