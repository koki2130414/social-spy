import { describe, expect, it } from 'vitest';
import type { Participant, RankingRow, Vote } from '@/lib/types';
import { computeFinalRanking, countCorrectSpies } from './final-score';

/**
 * 最後の総合順位。
 *
 * クエスト達成率100%で1ポイント、SPYを1人当てるごとに1ポイント。
 * 表彰でそのまま読み上げる数字なので、次の3つを固定する。
 *  ・当てた数が正しく数えられること（外した票を当たりに数えない）
 *  ・同じ点数の人が同じ順位になること
 *  ・欠席の人が絡む票を数えないこと
 */

function participant(id: string, over: Partial<Participant> = {}): Participant {
  return {
    id,
    eventId: 'ev1',
    displayName: id,
    affiliation: null,
    role: 'AGENT',
    loginId: null,
    attending: true,
    failedLoginCount: 0,
    loginLockedUntil: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function rankingRow(
  id: string,
  percent: number,
  lastCompletedAt: string | null = null,
): RankingRow {
  return {
    rank: 0,
    participantId: id,
    displayName: id,
    affiliation: null,
    completed: 0,
    total: 8,
    percent,
    lastCompletedAt,
  };
}

function vote(voter: string, target: string): Vote {
  return {
    id: `${voter}->${target}`,
    eventId: 'ev1',
    voterParticipantId: voter,
    targetParticipantId: target,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const people = [
  participant('spy1', { role: 'SPY' }),
  participant('spy2', { role: 'SPY' }),
  participant('a'),
  participant('b'),
  participant('c'),
];

describe('当てた数の数え方', () => {
  it('選んだ中の本物のSPYだけを数える', () => {
    const counts = countCorrectSpies(
      [vote('a', 'spy1'), vote('a', 'b'), vote('a', 'spy2')],
      new Set(['spy1', 'spy2']),
    );
    expect(counts.get('a')).toEqual({ correct: 2, picked: 3 });
  });

  it('1人も選ばなかった人は数に出てこない', () => {
    const counts = countCorrectSpies([vote('a', 'spy1')], new Set(['spy1']));
    expect(counts.get('b')).toBeUndefined();
  });
});

describe('総合順位', () => {
  it('達成率100%で1ポイント、SPY1人で1ポイント', () => {
    const rows = computeFinalRanking(
      [rankingRow('a', 100), rankingRow('b', 50), rankingRow('c', 0)],
      people,
      [vote('b', 'spy1'), vote('c', 'spy1'), vote('c', 'spy2')],
    );
    const byId = new Map(rows.map((r) => [r.participantId, r]));

    expect(byId.get('a')!.points).toBe(1); // 全問達成・SPYは当てず
    expect(byId.get('b')!.points).toBe(1.5); // 半分＋1人正解
    expect(byId.get('c')!.points).toBe(2); // 未達成でも2人正解
  });

  it('点数の高い順に並び、同点は同じ順位になる', () => {
    const rows = computeFinalRanking(
      [rankingRow('a', 100), rankingRow('b', 100), rankingRow('c', 0)],
      people,
      [],
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows[2].participantId).toBe('c');
  });

  it('外した票はポイントにならない', () => {
    const rows = computeFinalRanking([rankingRow('a', 0)], people, [
      vote('a', 'b'),
      vote('a', 'c'),
    ]);
    expect(rows[0].points).toBe(0);
    expect(rows[0].correctSpies).toBe(0);
    expect(rows[0].picked).toBe(2);
  });

  it('欠席の人が絡む票は数えない', () => {
    const withAbsent = [
      participant('spy1', { role: 'SPY', attending: false }),
      participant('spy2', { role: 'SPY' }),
      participant('a'),
    ];
    const rows = computeFinalRanking([rankingRow('a', 0)], withAbsent, [
      vote('a', 'spy1'), // 欠席のSPYを選んでも当たりにしない
      vote('a', 'spy2'),
    ]);
    expect(rows[0].correctSpies).toBe(1);
    expect(rows[0].picked).toBe(1);
  });

  it('同点なら、SPYを多く当てた人が上になる', () => {
    // どちらも 1.0 ポイント。片方は全問達成、片方は正解1人
    const rows = computeFinalRanking([rankingRow('a', 100), rankingRow('b', 0)], people, [
      vote('b', 'spy1'),
    ]);
    expect(rows[0].participantId).toBe('b');
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(1);
  });

  it('小数がずれた見た目にならない（0.1+0.2問題）', () => {
    const rows = computeFinalRanking([rankingRow('a', 30)], people, []);
    expect(rows[0].points).toBe(0.3);
  });
});
