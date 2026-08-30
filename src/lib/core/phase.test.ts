import { describe, expect, it } from 'vitest';
import {
  canRegister,
  canUpdateMissionProgress,
  canVoteInPhase,
  formatRemaining,
  isIdentityRevealed,
  isSpyMissionPublic,
  isValidPhaseTransition,
  nextPhase,
  remainingMs,
} from './phase';
import type { GamePhase } from '@/lib/types';

describe('ゲームフェーズ', () => {
  it('投票できるのは VOTING のみ', () => {
    const phases: GamePhase[] = [
      'LOBBY',
      'ACTIVE',
      'SPY_MISSION_REVEALED',
      'VOTING',
      'IDENTITY_REVEALED',
      'FINISHED',
    ];
    for (const p of phases) {
      expect(canVoteInPhase(p)).toBe(p === 'VOTING');
    }
  });

  it('MISSION操作は ACTIVE / SPY_MISSION_REVEALED のみ', () => {
    expect(canUpdateMissionProgress('LOBBY')).toBe(false);
    expect(canUpdateMissionProgress('ACTIVE')).toBe(true);
    expect(canUpdateMissionProgress('SPY_MISSION_REVEALED')).toBe(true);
    expect(canUpdateMissionProgress('VOTING')).toBe(false);
    expect(canUpdateMissionProgress('IDENTITY_REVEALED')).toBe(false);
  });

  it('SPY MISSION は SPY_MISSION_REVEALED 以降で公開される', () => {
    expect(isSpyMissionPublic('LOBBY')).toBe(false);
    expect(isSpyMissionPublic('ACTIVE')).toBe(false);
    expect(isSpyMissionPublic('SPY_MISSION_REVEALED')).toBe(true);
    expect(isSpyMissionPublic('VOTING')).toBe(true);
    expect(isSpyMissionPublic('FINISHED')).toBe(true);
  });

  it('正体公開は IDENTITY_REVEALED 以降', () => {
    expect(isIdentityRevealed('VOTING')).toBe(false);
    expect(isIdentityRevealed('IDENTITY_REVEALED')).toBe(true);
    expect(isIdentityRevealed('FINISHED')).toBe(true);
  });

  it('参加登録は LOBBY / ACTIVE のみ', () => {
    expect(canRegister('LOBBY')).toBe(true);
    expect(canRegister('ACTIVE')).toBe(true);
    expect(canRegister('VOTING')).toBe(false);
  });

  it('フェーズは1段階ずつしか進めず、巻き戻せない', () => {
    expect(isValidPhaseTransition('LOBBY', 'ACTIVE')).toBe(true);
    expect(isValidPhaseTransition('LOBBY', 'VOTING')).toBe(false);
    expect(isValidPhaseTransition('VOTING', 'ACTIVE')).toBe(false);
    expect(isValidPhaseTransition('ACTIVE', 'ACTIVE')).toBe(false);
    // 終了だけはどこからでも可能
    expect(isValidPhaseTransition('ACTIVE', 'FINISHED')).toBe(true);
    expect(isValidPhaseTransition('FINISHED', 'FINISHED')).toBe(false);
    expect(nextPhase('FINISHED')).toBeNull();
  });

  it('残り時間を計算できる', () => {
    const start = '2026-01-01T00:00:00.000Z';
    const now = new Date('2026-01-01T00:30:00.000Z').getTime();
    expect(remainingMs(start, 90, now)).toBe(60 * 60_000);
    expect(remainingMs(start, 10, now)).toBe(0);
    expect(remainingMs(null, 90, now)).toBeNull();
    expect(formatRemaining(60 * 60_000)).toBe('01:00:00');
    expect(formatRemaining(90_000)).toBe('01:30');
    expect(formatRemaining(null)).toBe('--:--');
  });
});
