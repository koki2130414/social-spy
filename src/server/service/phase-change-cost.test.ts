import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 「ゲーム開始」を押してから画面が変わるまでの重さ。
 *
 * データベースは東京、アプリはこれまで米国東部で動いていて、
 * 1往復あたり約240msかかっていた（本番の実測値）。
 * つまり往復の回数がそのまま待ち時間になる。
 *
 * ここでは往復の回数を数えて、人数が増えても増えないことを固定する。
 * 以前は参加者を1人ずつ更新していたため、101人だと101回ぶん待たされていた。
 */

let queries: string[] = [];
let tableRows: Record<string, unknown[]> = {};

function makeBuilder(table: string, op: string) {
  queries.push(`${table}.${op}`);
  const builder: Record<string, unknown> = {};
  let single = false;
  for (const m of [
    'select',
    'eq',
    'in',
    'or',
    'order',
    'limit',
    'neq',
    'not',
    'update',
    'insert',
    'delete',
  ]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => {
    single = true;
    return builder;
  };
  builder.single = () => {
    single = true;
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) => {
    const rows = tableRows[table] ?? [];
    return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(resolve);
  };
  return builder;
}

function client() {
  const from = (table: string) => ({
    select: () => makeBuilder(table, 'select'),
    update: () => makeBuilder(table, 'update'),
    insert: () => makeBuilder(table, 'insert'),
    delete: () => makeBuilder(table, 'delete'),
    upsert: () => makeBuilder(table, 'upsert'),
  });
  return { from };
}

vi.mock('@/server/supabase/clients', () => ({ supabaseAdmin: () => client() }));
vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { SupabaseRepo } from '@/server/repo/supabase-repo';

const EVENT_ID = 'ev-1';

function seed(participantCount: number) {
  tableRows = {
    participants: Array.from({ length: participantCount }, (_, i) => ({
      id: `p${i}`,
      event_id: EVENT_ID,
      display_name: `参加者${i}`,
      affiliation: null,
      role: 'AGENT',
      login_id: String(i + 1),
      attending: true,
      joined_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
    missions: [
      {
        id: 'sm1',
        event_id: EVENT_ID,
        code: 'S1',
        title: 'SPY',
        body: '本文',
        kind: 'SPY',
        difficulty: 'NORMAL',
        active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    participant_missions: [],
  };
}

async function countTrips(run: () => Promise<unknown>) {
  queries = [];
  await run();
  return queries.length;
}

describe('SPY MISSIONの配り直し', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  });

  it('すでにSPY MISSIONを持っている人には足さない', async () => {
    // SPY MISSIONは毎回くじ引き。選び直すたびに足すと、
    // 同じ人が3件→6件と増えて、その人の達成率だけ下がる＝正体がばれる
    seed(10);
    tableRows.participant_missions = [
      { id: 'pm1', participant_id: 'p0', mission_id: 'sm1', order_index: 1, completed: false },
    ];
    const repo = new SupabaseRepo();
    queries = [];
    await repo.setParticipantRoles(EVENT_ID, ['p0']);

    expect(queries.filter((q) => q === 'participant_missions.insert')).toHaveLength(0);
  });
});

describe('SPYを決めるときの往復回数', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  });

  it('人数が増えても往復回数が増えない', async () => {
    const repo = new SupabaseRepo();

    seed(10);
    const small = await countTrips(() => repo.setParticipantRoles(EVENT_ID, ['p0', 'p1']));

    seed(101);
    const large = await countTrips(() => repo.setParticipantRoles(EVENT_ID, ['p0', 'p1']));

    expect(large).toBe(small);
    // 往復の数がそのまま待ち時間になる（本番の実測で1往復240ms）。
    // 以前の作り（1人ずつ確かめて更新）は14往復あった。8回以内に収める
    expect(large).toBeLessThanOrEqual(8);
  });

  it('101人でも、参加者1人ずつの更新をしない', async () => {
    const repo = new SupabaseRepo();
    seed(101);
    queries = [];
    await repo.setParticipantRoles(EVENT_ID, ['p0', 'p1']);

    const updates = queries.filter((q) => q === 'participants.update').length;
    // 「SPY以外を戻す」「選んだ人をSPYにする」の2回だけ
    expect(updates).toBeLessThanOrEqual(2);
  });
});
