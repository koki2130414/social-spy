import { describe, expect, it } from 'vitest';
import { computeResults, validateVote } from './vote';
import { selectSpies } from './spy';
import type { Participant, Vote } from '@/lib/types';

function participant(id: string, role: Participant['role'] = 'AGENT'): Participant {
  return {
    id,
    eventId: 'ev1',
    displayName: `agent-${id}`,
    affiliation: null,
    role,
    loginId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const base = {
  phase: 'VOTING' as const,
  voterId: 'p1',
  targetId: 'p2',
  eventId: 'ev1',
  existingVote: null,
  target: { id: 'p2', eventId: 'ev1' },
};

describe('投票の検証', () => {
  it('VOTINGフェーズで他人へ1票なら成功する', () => {
    expect(validateVote(base)).toEqual({ ok: true });
  });

  it('自分自身へは投票できない', () => {
    const result = validateVote({
      ...base,
      targetId: 'p1',
      target: { id: 'p1', eventId: 'ev1' },
    });
    expect(result).toEqual({ ok: false, reason: 'SELF_VOTE_FORBIDDEN' });
  });

  it('二重投票はできない（投票後の変更もできない）', () => {
    const existingVote: Vote = {
      id: 'v1',
      eventId: 'ev1',
      voterParticipantId: 'p1',
      targetParticipantId: 'p3',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(validateVote({ ...base, existingVote })).toEqual({
      ok: false,
      reason: 'ALREADY_VOTED',
    });
    // 別の相手へ投票し直そうとしても拒否される
    expect(
      validateVote({
        ...base,
        existingVote,
        targetId: 'p4',
        target: { id: 'p4', eventId: 'ev1' },
      }),
    ).toEqual({ ok: false, reason: 'ALREADY_VOTED' });
  });

  it('VOTING以外のフェーズでは投票できない', () => {
    for (const phase of [
      'LOBBY',
      'ACTIVE',
      'SPY_MISSION_REVEALED',
      'IDENTITY_REVEALED',
      'FINISHED',
    ] as const) {
      expect(validateVote({ ...base, phase })).toEqual({
        ok: false,
        reason: 'PHASE_NOT_VOTING',
      });
    }
  });

  it('存在しない参加者・別イベントの参加者へは投票できない', () => {
    expect(validateVote({ ...base, target: null })).toEqual({
      ok: false,
      reason: 'TARGET_NOT_FOUND',
    });
    expect(validateVote({ ...base, target: { id: 'p2', eventId: 'ev2' } })).toEqual({
      ok: false,
      reason: 'TARGET_OTHER_EVENT',
    });
  });
});

describe('結果集計', () => {
  const participants = [
    participant('p1'),
    participant('p2', 'SPY'),
    participant('p3'),
    participant('p4', 'SPY'),
  ];
  const votes: Vote[] = [
    {
      id: 'v1',
      eventId: 'ev1',
      voterParticipantId: 'p1',
      targetParticipantId: 'p2',
      createdAt: '',
    },
    {
      id: 'v2',
      eventId: 'ev1',
      voterParticipantId: 'p2',
      targetParticipantId: 'p3',
      createdAt: '',
    },
    {
      id: 'v3',
      eventId: 'ev1',
      voterParticipantId: 'p3',
      targetParticipantId: 'p2',
      createdAt: '',
    },
    {
      id: 'v4',
      eventId: 'ev1',
      voterParticipantId: 'p4',
      targetParticipantId: 'p1',
      createdAt: '',
    },
  ];

  it('複数SPYの正体をすべて返す', () => {
    const result = computeResults(participants, votes);
    expect(result.spies.map((s) => s.id).sort()).toEqual(['p2', 'p4']);
    expect(result.spies.every((s) => !('role' in s))).toBe(true);
  });

  it('得票数の多い順に並ぶ', () => {
    const result = computeResults(participants, votes);
    expect(result.rows[0]).toMatchObject({ participantId: 'p2', votes: 2, isSpy: true });
    expect(result.totalVotes).toBe(4);
  });

  it('SPYへ投票できた人数を数える', () => {
    const result = computeResults(participants, votes);
    expect(result.correctVoters).toBe(2);
  });
});

describe('SPYの選出', () => {
  it('指定人数のSPYを重複なく選ぶ', () => {
    const participants = ['a', 'b', 'c', 'd', 'e'].map((id) => participant(id));
    const { spyIds, agentIds } = selectSpies(participants, 2);
    expect(spyIds).toHaveLength(2);
    expect(new Set(spyIds).size).toBe(2);
    expect(agentIds).toHaveLength(3);
  });

  it('参加者数を超える人数を指定しても壊れない', () => {
    const participants = [participant('a')];
    const { spyIds } = selectSpies(participants, 5);
    expect(spyIds).toHaveLength(1);
  });
});
