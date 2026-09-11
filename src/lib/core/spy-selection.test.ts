import { describe, expect, it } from 'vitest';
import { selectSpies, spiesOf } from './spy';
import { computeResults, validateVote } from './vote';
import { createRng } from './random';
import type { Participant, Vote } from '@/lib/types';

/**
 * 当日欠席にした人が、ゲームの中核からきちんと外れているか。
 *
 * いちばん怖いのは「SPYが当日来ていない人だった」という事故。
 * SPYはゲーム開始の瞬間に選ばれるので、開始前に欠席にしておけば防げる——
 * その前提がここで崩れていないことを確かめる。
 */

function p(id: string, attending = true, role: Participant['role'] = 'AGENT'): Participant {
  return {
    id,
    eventId: 'ev1',
    displayName: id,
    affiliation: null,
    role,
    loginId: null,
    attending,
    joinedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function vote(voter: string, target: string): Vote {
  return {
    id: `v-${voter}`,
    eventId: 'ev1',
    voterParticipantId: voter,
    targetParticipantId: target,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('SPYの抽選', () => {
  it('欠席にした人はSPYに選ばれない（種を変えて100回試す）', () => {
    const people = [
      p('a'),
      p('欠席1', false),
      p('b'),
      p('欠席2', false),
      p('c'),
      p('欠席3', false),
    ];

    for (let seed = 1; seed <= 100; seed += 1) {
      const { spyIds } = selectSpies(people, 3, createRng(seed));
      expect(spyIds).toHaveLength(3);
      expect(spyIds).not.toContain('欠席1');
      expect(spyIds).not.toContain('欠席2');
      expect(spyIds).not.toContain('欠席3');
    }
  });

  it('欠席が多くて人数が足りないときは、いる人の数までしか選ばない', () => {
    const people = [p('a'), p('欠席1', false), p('欠席2', false)];
    const { spyIds } = selectSpies(people, 3);
    // ここで3名返すと、いない人がSPYになってしまう
    expect(spyIds).toEqual(['a']);
  });

  it('全員欠席なら誰も選ばれない（落ちたりしない）', () => {
    const { spyIds } = selectSpies([p('欠席1', false), p('欠席2', false)], 2);
    expect(spyIds).toEqual([]);
  });

  it('すでにSPYだった人を欠席にすると、SPY一覧から消える', () => {
    const people = [p('a', true, 'SPY'), p('来なかったSPY', false, 'SPY')];
    expect(spiesOf(people).map((x) => x.id)).toEqual(['a']);
  });
});

describe('欠席者と投票', () => {
  const base = {
    phase: 'VOTING' as const,
    voterId: 'p1',
    targetId: 'p2',
    eventId: 'ev1',
    existingVote: null,
  };

  it('欠席にされた人は投票できない', () => {
    expect(
      validateVote({
        ...base,
        target: { id: 'p2', eventId: 'ev1', attending: true },
        voterAttending: false,
      }),
    ).toEqual({ ok: false, reason: 'VOTER_NOT_ATTENDING' });
  });

  it('欠席にされた人へは投票できない', () => {
    expect(
      validateVote({
        ...base,
        target: { id: 'p2', eventId: 'ev1', attending: false },
        voterAttending: true,
      }),
    ).toEqual({ ok: false, reason: 'TARGET_NOT_ATTENDING' });
  });

  it('出席者どうしならこれまでどおり投票できる', () => {
    expect(
      validateVote({
        ...base,
        target: { id: 'p2', eventId: 'ev1', attending: true },
        voterAttending: true,
      }),
    ).toEqual({ ok: true });
  });
});

describe('欠席者と結果の集計', () => {
  it('欠席者は結果に出ず、その人が絡む票も数えない', () => {
    const people = [p('a', true, 'SPY'), p('b'), p('欠席', false)];
    const votes = [
      vote('b', 'a'), // 出席どうし → 数える
      vote('欠席', 'a'), // 欠席者が投じた票 → 数えない
      vote('a', '欠席'), // 欠席者への票 → 数えない
    ];

    const result = computeResults(people, votes);

    expect(result.rows.map((r) => r.participantId)).toEqual(['a', 'b']);
    expect(result.totalParticipants).toBe(2);
    expect(result.totalVotes).toBe(1);
    expect(result.rows.find((r) => r.participantId === 'a')?.votes).toBe(1);
    expect(result.correctVoters).toBe(1);
  });

  it('欠席にしたSPYは正体公開に出てこない', () => {
    const people = [p('来たSPY', true, 'SPY'), p('来なかったSPY', false, 'SPY'), p('b')];
    const result = computeResults(people, []);
    expect(result.spies.map((s) => s.id)).toEqual(['来たSPY']);
  });
});
