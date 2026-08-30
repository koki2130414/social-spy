import { describe, expect, it } from 'vitest';
import { pickMissionsForParticipant, pickSpyMissions, MISSIONS_PER_PARTICIPANT } from './missions';
import { createRng } from './random';
import type { Mission } from '@/lib/types';

function mission(id: string, kind: Mission['kind'] = 'GENERAL', active = true): Mission {
  return {
    id,
    eventId: 'ev1',
    code: `CODE-${id}`,
    title: `title-${id}`,
    body: `body-${id}`,
    kind,
    active,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const POOL: Mission[] = [
  mission('g1'),
  mission('g2'),
  mission('g3'),
  mission('g4'),
  mission('g5'),
  mission('g6'),
  mission('s1', 'SPY'),
  mission('s2', 'SPY'),
  mission('inactive', 'GENERAL', false),
];

describe('MISSION 配布', () => {
  it('一般参加者へ3件のMISSIONを配布する', () => {
    const picked = pickMissionsForParticipant(POOL, { rng: createRng(1) });
    expect(picked).toHaveLength(MISSIONS_PER_PARTICIPANT);
    expect(picked.map((p) => p.orderIndex)).toEqual([1, 2, 3]);
  });

  it('同一人物へ同じMISSIONを重複配布しない', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickMissionsForParticipant(POOL, { rng: createRng(seed) });
      const ids = picked.map((p) => p.missionId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('SPY MISSION と無効なMISSIONは一般配布の対象外', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const picked = pickMissionsForParticipant(POOL, { rng: createRng(seed) });
      for (const p of picked) {
        expect(p.missionId.startsWith('g')).toBe(true);
      }
    }
  });

  it('除外指定したMISSIONは配布されない', () => {
    const picked = pickMissionsForParticipant(POOL, {
      rng: createRng(7),
      excludeMissionIds: ['g1', 'g2', 'g3'],
    });
    expect(picked.map((p) => p.missionId).sort()).toEqual(['g4', 'g5', 'g6']);
  });

  it('候補が3件未満なら、あるだけ配布する（重複はさせない）', () => {
    const picked = pickMissionsForParticipant([mission('g1'), mission('g2')], {
      rng: createRng(3),
    });
    expect(picked).toHaveLength(2);
  });

  it('SPY MISSION は有効なものだけが割り当てられる', () => {
    const spy = pickSpyMissions(POOL);
    expect(spy.map((s) => s.missionId).sort()).toEqual(['s1', 's2']);
  });
});
