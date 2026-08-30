import { GAME_PHASES, type GamePhase } from '@/lib/types';

export interface PhaseMeta {
  phase: GamePhase;
  /** 画面見出し用の英語表記 */
  headline: string;
  /** 日本語の状態名 */
  label: string;
  /** 参加者への説明 */
  description: string;
  /** 次に行うべき操作 */
  nextAction: string;
}

export const PHASE_META: Record<GamePhase, PhaseMeta> = {
  LOBBY: {
    phase: 'LOBBY',
    headline: 'STANDBY',
    label: '待機中',
    description: 'ゲーム開始前です。自分のMISSIONを確認して待機してください。',
    nextAction: 'MISSIONを確認する',
  },
  ACTIVE: {
    phase: 'ACTIVE',
    headline: 'OPERATION START',
    label: '任務遂行中',
    description: 'MISSIONを実行してください。達成したら自己申告で記録します。',
    nextAction: 'MISSIONを実行して達成を記録する',
  },
  SPY_MISSION_REVEALED: {
    phase: 'SPY_MISSION_REVEALED',
    headline: 'SPY MISSION REVEALED',
    label: 'SPY情報公開',
    description: 'SPYに与えられていたMISSIONが公開されました。SPYを推理してください。',
    nextAction: 'SPY情報を確認する',
  },
  VOTING: {
    phase: 'VOTING',
    headline: 'OPERATION TERMINATED',
    label: '投票受付中',
    description: 'MISSIONは終了しました。SPYだと思う人に投票してください。',
    nextAction: 'FINAL VOTE を行う',
  },
  IDENTITY_REVEALED: {
    phase: 'IDENTITY_REVEALED',
    headline: 'IDENTITY REVEAL',
    label: '正体公開',
    description: 'SPYの正体が公開されました。結果を確認してください。',
    nextAction: '結果を確認する',
  },
  FINISHED: {
    phase: 'FINISHED',
    headline: 'MISSION COMPLETE',
    label: '終了',
    description: 'ゲームは終了しました。お疲れさまでした。',
    nextAction: '結果を確認する',
  },
};

export const PHASE_ORDER: GamePhase[] = [...GAME_PHASES];

export function phaseIndex(phase: GamePhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/** 参加者登録を受け付けられるフェーズか */
export function canRegister(phase: GamePhase): boolean {
  return phase === 'LOBBY' || phase === 'ACTIVE';
}

/** MISSION の達成状態を更新できるフェーズか */
export function canUpdateMissionProgress(phase: GamePhase): boolean {
  return phase === 'ACTIVE' || phase === 'SPY_MISSION_REVEALED';
}

/** 投票できるフェーズか */
export function canVoteInPhase(phase: GamePhase): boolean {
  return phase === 'VOTING';
}

/** SPY MISSION が全員に公開されているフェーズか */
export function isSpyMissionPublic(phase: GamePhase): boolean {
  return (
    phase === 'SPY_MISSION_REVEALED' ||
    phase === 'VOTING' ||
    phase === 'IDENTITY_REVEALED' ||
    phase === 'FINISHED'
  );
}

/** SPY の正体が公開されているフェーズか */
export function isIdentityRevealed(phase: GamePhase): boolean {
  return phase === 'IDENTITY_REVEALED' || phase === 'FINISHED';
}

/** 結果画面を閲覧できるフェーズか */
export function canViewResult(phase: GamePhase): boolean {
  return isIdentityRevealed(phase);
}

export function nextPhase(phase: GamePhase): GamePhase | null {
  const i = phaseIndex(phase);
  if (i < 0 || i >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[i + 1];
}

/**
 * フェーズ遷移の妥当性。
 * MVPでは「1つずつ前進」または「FINISHED への終了」のみを許可する。
 * 巻き戻しは投票やMISSIONの整合性が壊れるため禁止。
 */
export function isValidPhaseTransition(from: GamePhase, to: GamePhase): boolean {
  if (from === to) return false;
  if (to === 'FINISHED') return from !== 'FINISHED';
  return nextPhase(from) === to;
}

/** 現在のフェーズにおける「次に行うべき操作」の導線 */
export function participantPrimaryAction(phase: GamePhase): { label: string; href: string } {
  switch (phase) {
    case 'LOBBY':
    case 'ACTIVE':
      return { label: 'MISSIONを確認する', href: '/game/missions' };
    case 'SPY_MISSION_REVEALED':
      return { label: 'SPY情報を確認する', href: '/game/intel' };
    case 'VOTING':
      return { label: 'FINAL VOTE へ進む', href: '/game/vote' };
    case 'IDENTITY_REVEALED':
    case 'FINISHED':
      return { label: '結果を確認する', href: '/game/result' };
  }
}

/** 残り時間（ミリ秒）。開始前・時間切れは null / 0 */
export function remainingMs(
  activeStartedAt: string | null,
  durationMinutes: number,
  now: number = Date.now(),
): number | null {
  if (!activeStartedAt) return null;
  const end = new Date(activeStartedAt).getTime() + durationMinutes * 60_000;
  return Math.max(0, end - now);
}

export function formatRemaining(ms: number | null): string {
  if (ms === null) return '--:--';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
