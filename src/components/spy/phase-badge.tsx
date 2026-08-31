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

/**
 * 進行状況のバッジ。
 *
 * 参加者向けは世界観に合わせて英語（STANDBY / OPERATION START ...）、
 * 運営向けは一目で分かることを優先して日本語（待機中 / 任務遂行中 ...）で出す。
 */
export function PhaseBadge({ phase, japanese = false }: { phase: GamePhase; japanese?: boolean }) {
  const meta = PHASE_META[phase];
  return (
    <Badge variant={VARIANT[phase]} title={japanese ? meta.headline : meta.label}>
      {japanese ? meta.label : meta.headline}
    </Badge>
  );
}
