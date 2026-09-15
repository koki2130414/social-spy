import { describe, expect, it } from 'vitest';
import { completionPercent, computeRanking, overallPercent } from './score';
import type { MissionProgress, Participant } from '@/lib/types';

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

function progress(
  participantId: string,
  completed: number,
  total = 3,
  extra: Partial<MissionProgress> = {},
): MissionProgress {
  return {
    participantId,
    completed,
    total,
    spyCompleted: 0,
    spyTotal: 0,
    lastCompletedAt: null,
    lastSpyCompletedAt: null,
    ...extra,
  };
}

describe('達成率の計算', () => {
  it('達成数を配布数で割った百分率になる', () => {
    expect(completionPercent(0, 3)).toBe(0);
    expect(completionPercent(1, 3)).toBe(33);
    expect(completionPercent(2, 3)).toBe(67);
    expect(completionPercent(3, 3)).toBe(100);
  });

  it('配られていない人は0%（0で割らない）', () => {
    expect(completionPercent(0, 0)).toBe(0);
  });

  it('全部やっていないのに100%とは表示しない', () => {
    // 200件中199件 = 99.5% → 四捨五入すると100%になってしまう
    expect(completionPercent(199, 200)).toBe(99);
    expect(completionPercent(200, 200)).toBe(100);
  });
});

describe('ランキング', () => {
  it('達成率の高い順に並ぶ', () => {
    const rows = computeRanking(
      [p('a'), p('b'), p('c')],
      [progress('a', 1), progress('b', 3), progress('c', 2)],
      { includeSpyMissions: false },
    );
    expect(rows.map((r) => r.participantId)).toEqual(['b', 'c', 'a']);
    expect(rows.map((r) => r.percent)).toEqual([100, 67, 33]);
  });

  it('同じ達成率なら先に達成した人が上に出る', () => {
    const rows = computeRanking(
      [p('おそい'), p('はやい')],
      [
        progress('おそい', 3, 3, { lastCompletedAt: '2026-01-01T00:30:00.000Z' }),
        progress('はやい', 3, 3, { lastCompletedAt: '2026-01-01T00:10:00.000Z' }),
      ],
      { includeSpyMissions: false },
    );
    expect(rows.map((r) => r.participantId)).toEqual(['はやい', 'おそい']);
  });

  it('同じ達成率の人は同じ順位（1位が複数いてよい）', () => {
    const rows = computeRanking(
      [p('a'), p('b'), p('c')],
      [
        progress('a', 3, 3, { lastCompletedAt: '2026-01-01T00:10:00.000Z' }),
        progress('b', 3, 3, { lastCompletedAt: '2026-01-01T00:20:00.000Z' }),
        progress('c', 1),
      ],
      { includeSpyMissions: false },
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('欠席にした人は出てこない', () => {
    const rows = computeRanking(
      [p('いる人'), p('欠席', false)],
      [progress('いる人', 1), progress('欠席', 3)],
      { includeSpyMissions: false },
    );
    expect(rows.map((r) => r.participantId)).toEqual(['いる人']);
  });

  it('まだ1件も達成していない人は後ろに回る', () => {
    const rows = computeRanking(
      [p('未達成'), p('達成済み')],
      [progress('未達成', 0), progress('達成済み', 0, 3, { lastCompletedAt: null })],
      { includeSpyMissions: false },
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.percent === 0)).toBe(true);
  });
});

/**
 * ここが今回いちばん大事なテスト。
 *
 * 正体公開前のランキングに SPY MISSION が混ざると、公開の瞬間に
 * SPY だけ分母が 3 から 6 に増えて達成率が落ちる。
 * ランキングを見ているだけで誰が SPY か分かってしまう。
 */
describe('SPY MISSION が達成率へ漏れないこと', () => {
  const people = [p('スパイ', true, 'SPY'), p('一般')];
  const withSpyWork = [
    progress('スパイ', 3, 3, { spyCompleted: 0, spyTotal: 3 }),
    progress('一般', 3, 3),
  ];

  it('正体公開前は、SPYも一般も同じ100%に見える', () => {
    const rows = computeRanking(people, withSpyWork, { includeSpyMissions: false });
    expect(rows.map((r) => r.percent)).toEqual([100, 100]);
    // 分母にSPY MISSIONが混ざっていないこと
    expect(rows.every((r) => r.total === 3)).toBe(true);
  });

  it('正体公開前は、SPYがSPY MISSIONを達成しても達成率が動かない', () => {
    const before = computeRanking(people, withSpyWork, { includeSpyMissions: false });
    const after = computeRanking(
      people,
      [progress('スパイ', 3, 3, { spyCompleted: 3, spyTotal: 3 }), progress('一般', 3, 3)],
      { includeSpyMissions: false },
    );
    expect(after.find((r) => r.participantId === 'スパイ')?.percent).toBe(
      before.find((r) => r.participantId === 'スパイ')?.percent,
    );
  });

  it('正体公開後はSPY MISSIONも達成率に入る', () => {
    const rows = computeRanking(people, withSpyWork, { includeSpyMissions: true });
    // スパイは 3/6 = 50%、一般は 3/3 = 100%
    expect(rows.find((r) => r.participantId === 'スパイ')?.percent).toBe(50);
    expect(rows.find((r) => r.participantId === '一般')?.percent).toBe(100);
  });
});

describe('全体の達成率', () => {
  it('配った件数に対する達成件数の割合になる', () => {
    const rows = computeRanking([p('a'), p('b')], [progress('a', 3), progress('b', 0)], {
      includeSpyMissions: false,
    });
    // 6件配って3件達成 → 50%
    expect(overallPercent(rows)).toBe(50);
  });
});
