import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em]',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        intel: 'border-intel/50 bg-intel/15 text-intel',
        amber: 'border-amber/50 bg-amber/15 text-amber',
        danger: 'border-primary/60 bg-primary/15 text-primary',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
