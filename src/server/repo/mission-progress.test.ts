import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 達成率の集計が、データベースへ何往復するか。
 *
 * ランキングは全員ぶんの進捗が要るので、作り方を間違えると
 * 参加者ごとに問い合わせる形になりやすい。100人 × 60ms で6秒かかり、
 * これを100台の端末が数十秒おきに叩くと当日に詰まる。
 *
 * 往復回数はモックしたSupabaseクライアントで直接数える。
 * DemoRepo はメモリ上で動くため、この問題を検出できない。
 */

let queries: string[] = [];
let tableRows: Record<string, unknown[]> = {};

function makeBuilder(table: string, op: string) {
  queries.push(`${table}.${op}`);
  const rows = tableRows[table] ?? [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'neq']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return builder;
}

vi.mock('@/server/supabase/clients', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: (...a: unknown[]) => {
        const b = makeBuilder(table, 'select');
        return (b.select as (...x: unknown[]) => unknown)(...a);
      },
    }),
  }),
}));

import { SupabaseRepo } from './supabase-repo';

const EVENT_ID = 'ev-1';

function seed(participantCount: number) {
  tableRows = {
    participants: Array.from({ length: participantCount }, (_, i) => ({
      id: `p${i}`,
      event_id: EVENT_ID,
      display_name: `参加者${i}`,
      affiliation: null,
      role: 'AGENT',
      login_id: null,
      attending: true,
      joined_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
    participant_missions: Array.from({ length: participantCount }, (_, i) => ({
      participant_id: `p${i}`,
      completed: i % 2 === 0,
      completed_at: i % 2 === 0 ? '2026-01-01T00:10:00.000Z' : null,
      missions: { kind: 'GENERAL' },
    })),
  };
}

describe('達成率集計の往復回数', () => {
  beforeEach(() => {
    queries = [];
  });

  it('100人でも往復回数が増えない', async () => {
    seed(5);
    await new SupabaseRepo().missionProgress(EVENT_ID);
    const forFive = queries.length;

    queries = [];
    seed(100);
    await new SupabaseRepo().missionProgress(EVENT_ID);
    const forHundred = queries.length;

    expect(forFive).toBe(forHundred);
    // 参加者一覧 / 進捗一覧 の2往復で終える
    expect(forHundred).toBeLessThanOrEqual(2);
  });
});
