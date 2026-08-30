import { GameShell } from '@/components/spy/game-shell';

export const dynamic = 'force-dynamic';

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <GameShell>{children}</GameShell>;
}
