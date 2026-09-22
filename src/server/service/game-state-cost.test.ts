import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 参加者の画面が1回更新されるたびに、データベースへ何往復し、
 * 何行ぶん取ってくるか。
 *
 * 当日この画面は101台が15秒おきに叩き、さらにフェーズが変わった瞬間には
 * Realtime で全員が同時に叩く。1回のコストがそのまま101倍になるので、
 * ここが増えると会場でいっせいに重くなる。
 *
 * 往復回数はモックしたSupabaseクライアントで数える。
 * DemoRepo はメモリ上で動くため、この問題を検出できない。
 */

let queries: string[] = [];
let rowsRead = 0;
let tableRows: Record<string, unknown[]> = {};

function makeBuilder(table: string, op: string) {
  queries.push(`${table}.${op}`);
  const builder: Record<string, unknown> = {};
  let single = false;
  let countOnly = false;
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'neq']) {
    builder[m] = (...args: unknown[]) => {
      // count: 'exact', head: true は行を運ばない問い合わせ
      const opts = args[1] as { count?: string; head?: boolean } | undefined;
      if (opts?.head) countOnly = true;
      return builder;
    };
  }
  builder.maybeSingle = () => {
    single = true;
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) => {
    const rows = tableRows[table] ?? [];
    if (countOnly)
      return Promise.resolve({ data: null, count: rows.length, error: null }).then(resolve);
    const data = single ? (rows[0] ?? null) : rows;
    rowsRead += single ? (rows[0] ? 1 : 0) : rows.length;
    return Promise.resolve({ data, error: null }).then(resolve);
  };
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

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { SupabaseRepo } from '@/server/repo/supabase-repo';
import { setParticipantSession } from '@/server/auth/session';
import { getGameState } from '@/server/service/participant';
import { cookieJar } from '@/test/next-headers-mock';

const EVENT_ID = 'ev-1';
const ME = 'p0';

function seed(participantCount: number) {
  tableRows = {
    events: [
      {
        id: EVENT_ID,
        name: 'イベント',
        code: 'CODE',
        phase: 'ACTIVE',
        phase_changed_at: '2026-01-01T00:00:00.000Z',
        active_started_at: '2026-01-01T00:00:00.000Z',
        duration_minutes: 90,
        spy_reveal_offset_minutes: 60,
        spy_count: 2,
        registration_open: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
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
    participant_missions: Array.from({ length: 8 }, (_, i) => ({
      id: `pm${i}`,
      participant_id: ME,
      mission_id: `m${i}`,
      order_index: i,
      completed: i < 3,
      completed_at: null,
      missions: {
        id: `m${i}`,
        event_id: EVENT_ID,
        code: `G${i}`,
        title: `ミッション${i}`,
        body: '本文',
        kind: 'GENERAL',
        difficulty: 1,
        active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })),
    missions: Array.from({ length: 11 }, (_, i) => ({
      id: `m${i}`,
      event_id: EVENT_ID,
      code: `C${i}`,
      title: `ミッション${i}`,
      body: '本文',
      kind: i < 8 ? 'GENERAL' : 'SPY',
      difficulty: 1,
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
    notifications: [],
    votes: [],
  };
}

async function measure(run: () => Promise<unknown>) {
  queries = [];
  rowsRead = 0;
  await run();
  return { trips: queries.length, rows: rowsRead, queries: [...queries] };
}

describe('参加者画面1回ぶんのコスト（101人のイベント）', () => {
  beforeEach(async () => {
    seed(101);
    cookieJar.clear();
    // Supabase を使う設定にして、モックしたクライアントを通す
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('SPY_SESSION_SECRET', 'test-secret-value-1234567890');
    await setParticipantSession(ME, EVENT_ID);
  });

  it('画面の更新1回で、参加者の表を丸ごと取ってこない', async () => {
    const repo = new SupabaseRepo();
    const { rows } = await measure(async () => {
      await repo.getEvent(EVENT_ID);
      await repo.listAssignedMissions(ME);
    });
    // この2つだけなら、101人ぶんの行は出てこないはず
    expect(rows).toBeLessThan(30);
  });

  it('参加者の人数は、行を運ばない数え上げで取る', async () => {
    const repo = new SupabaseRepo();
    const before = await measure(() => repo.listParticipants(EVENT_ID));
    const after = await measure(() => repo.countParticipants(EVENT_ID));

    expect(before.rows).toBe(101);
    // 人数を知るためだけに101行を運ばない
    expect(after.rows).toBe(0);
    expect(after.trips).toBe(1);
  });
});

describe('画面の更新1回ぶん（getGameState）', () => {
  beforeEach(async () => {
    seed(101);
    cookieJar.clear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('SPY_SESSION_SECRET', 'test-secret-value-1234567890');
    await setParticipantSession(ME, EVENT_ID);
  });

  it('参加者101人ぶんの行を運ばない', async () => {
    const { rows, queries } = await measure(() => getGameState());
    // 人数は数え上げで取るので、101行が出てくることはない
    expect(rows).toBeLessThan(40);
    expect(queries.filter((q) => q === 'participants.select').length).toBeLessThanOrEqual(2);
  });

  it('待ち合わせの回数（直列の段数）が2段を超えない', async () => {
    // 直列に並べるほど、1回の更新にかかる時間が積み上がる。
    // ここでは「同時に投げた数」ではなく段数を見たいので、
    // 往復の総数が想定以上に増えていないかで代用する
    const { trips } = await measure(() => getGameState());
    expect(trips).toBeLessThanOrEqual(6);
  });

  it('SPY MISSIONが公開されていないフェーズでは、MISSION一覧を引かない', async () => {
    const { queries } = await measure(() => getGameState());
    expect(queries).not.toContain('missions.select');
  });
});
