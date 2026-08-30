import { Badge } from '@/components/ui/badge';
import { PHASE_META } from '@/lib/core/phase';
import type { GamePhase } from '@/lib/types';

const VARIANT: Record<GamePhase, 'default' | 'intel' | 'amber' | 'danger' | 'outline'> = {
  LOBBY: 'outline',
  ACTIVE: 'intel',
  SPY_MISSION_REVEALED: 'amber',
  VOTING: 'danger',
  IDENTITY_REVEALED: 'danger',
  FINISHED: 'default',
};

export function PhaseBadge({ phase }: { phase: GamePhase }) {
  const meta = PHASE_META[phase];
  return (
    <Badge variant={VARIANT[phase]} title={meta.label}>
      {meta.headline}
    </Badge>
  );
}
