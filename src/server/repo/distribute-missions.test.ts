import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MISSION の一括配布が、データベースへ何往復するか。
 *
 * ここは 100人規模で壊れやすい箇所。参加者ごとに問い合わせると
 * 人数 × 往復になり、1往復60msなら100人で35秒。
 * Vercel の実行時間上限（10〜15秒）を超えて配布が失敗する。
 *
 * 往復回数はモックした Supabase クライアントで直接数える。
 * DemoRepo では往復が発生しないため、この問題は検出できない。
 */

/** 発行されたクエリの記録 */
let queries: string[] = [];

/** insert に渡された行。書き込み漏れを見つけるために残す */
let inserted: unknown[] = [];

/** テーブルごとに返す行 */
let tableRows: Record<string, unknown[]> = {};

/**
 * Supabase のクエリビルダを最小限だけ真似る。
 * select/eq/in/or/order は自分を返し、await されたら行を返す。
 */
function makeBuilder(table: string, op: string) {
  queries.push(`${table}.${op}`);
  const rows = op === 'insert' ? [] : (tableRows[table] ?? []);
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'neq']) {
    builder[m] = () => builder;
  }
  builder.single = () => ({
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: (tableRows[table] ?? [])[0] ?? {}, error: null }).then(resolve),
  });
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
      insert: (...a: unknown[]) => {
        inserted.push(...(Array.isArray(a[0]) ? a[0] : [a[0]]));
        const b = makeBuilder(table, 'insert');
        return (b.select as (...x: unknown[]) => unknown)(...a);
      },
      update: (...a: unknown[]) => {
        inserted.push(a[0]);
        const b = makeBuilder(table, 'update');
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
      joined_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
    // 誰にも配られていない状態
    participant_missions: [],
    missions: Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      event_id: EVENT_ID,
      code: `G${i}`,
      title: `任務${i}`,
      body: '本文',
      kind: 'GENERAL',
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
  };
}

describe('MISSION一括配布の往復回数', () => {
  beforeEach(() => {
    queries = [];
    inserted = [];
  });

  it('100人でも往復回数が増えない', async () => {
    seed(5);
    await new SupabaseRepo().distributeGeneralMissions(EVENT_ID);
    const forFive = queries.length;

    queries = [];
    seed(100);
    await new SupabaseRepo().distributeGeneralMissions(EVENT_ID);
    const forHundred = queries.length;

    expect(forFive).toBe(forHundred);
    // 参加者一覧 / 配布済み一覧 / MISSION一覧 / 挿入 の4往復で終える
    expect(forHundred).toBeLessThanOrEqual(4);
  });

  it('100人ぶんを1回の挿入でまとめる', async () => {
    seed(100);
    await new SupabaseRepo().distributeGeneralMissions(EVENT_ID);

    const inserts = queries.filter((q) => q === 'participant_missions.insert');
    expect(inserts.length).toBe(1);
  });

  it('参加者がいなければ何もしない', async () => {
    seed(0);
    const result = await new SupabaseRepo().distributeGeneralMissions(EVENT_ID);

    expect(result.assigned).toBe(0);
    expect(queries.filter((q) => q.endsWith('.insert')).length).toBe(0);
  });

  it('MISSIONを作るとき、難易度も一緒に保存する', async () => {
    // 読む側だけ直して書く側を忘れると、全部ノーマルとして保存されてしまう
    seed(0);
    await new SupabaseRepo().createMission({
      eventId: EVENT_ID,
      code: 'H-9',
      title: '試験',
      body: '本文',
      kind: 'GENERAL',
      difficulty: 'HARD',
      active: true,
    });

    const row = inserted[0] as Record<string, unknown>;
    expect(row.difficulty).toBe('HARD');
  });

  it('MISSIONの難易度を変更できる', async () => {
    seed(0);
    await new SupabaseRepo().updateMission('ms-1', { difficulty: 'EASY' });

    const patch = inserted[0] as Record<string, unknown>;
    expect(patch.difficulty).toBe('EASY');
  });
});
