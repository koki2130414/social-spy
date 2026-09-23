import { beforeEach, describe, it, vi } from 'vitest';

/**
 * 当日（101人）のデータベース負荷の見積もり。
 *
 * ローカルのデモ用リポジトリはメモリ上で動くので、
 * 「何回データベースへ往復するか」「何行運ぶか」は分からない。
 * 本番は Vercel(東京) と Supabase(東京) の間で1往復あたり約30ms。
 * 画面1回ぶんの往復回数と行数を数えて、人数ぶんに掛けて見積もる。
 *
 *   npx vitest run --config scripts/db-load.config.ts
 */

const ROUND_TRIP_MS = 30; // 本番実測（東京同士）
const PEOPLE = 101;

let queries: string[] = [];
let rowsRead = 0;
let tableRows: Record<string, unknown[]> = {};

function makeBuilder(table: string, op: string) {
  queries.push(`${table}.${op}`);
  const builder: Record<string, unknown> = {};
  let single = false;
  let countOnly = false;
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
    'upsert',
  ]) {
    builder[m] = (...args: unknown[]) => {
      const opts = args[1] as { count?: string; head?: boolean } | undefined;
      if (opts?.head) countOnly = true;
      return builder;
    };
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
      update: () => makeBuilder(table, 'update'),
      insert: () => makeBuilder(table, 'insert'),
      delete: () => makeBuilder(table, 'delete'),
      upsert: () => makeBuilder(table, 'upsert'),
    }),
  }),
}));

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { setParticipantSession } from '@/server/auth/session';
import { cookieJar } from '@/test/next-headers-mock';
import { getGameState, listVoteCandidates } from '@/server/service/participant';
import { SupabaseRepo } from '@/server/repo/supabase-repo';

const EVENT_ID = 'ev-1';
const ME = 'p0';

function seed(phase = 'ACTIVE') {
  tableRows = {
    events: [
      {
        id: EVENT_ID,
        name: 'イベント',
        code: 'CODE',
        phase,
        phase_changed_at: '2026-01-01T00:00:00.000Z',
        active_started_at: '2026-01-01T00:00:00.000Z',
        duration_minutes: 90,
        spy_reveal_offset_minutes: 45,
        spy_count: 5,
        registration_open: true,
        archived_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    participants: Array.from({ length: PEOPLE }, (_, i) => ({
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
        difficulty: 'NORMAL',
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
      difficulty: 'NORMAL',
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })),
    notifications: [],
    votes: [],
  };
}

async function measure(name: string, run: () => Promise<unknown>) {
  queries = [];
  rowsRead = 0;
  let error = '';
  try {
    await run();
  } catch (e) {
    error = String(e).slice(0, 80);
  }
  return { name, trips: queries.length, rows: rowsRead, error, list: [...queries] };
}

describe('当日のデータベース負荷の見積もり', () => {
  beforeEach(async () => {
    cookieJar.clear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('SPY_SESSION_SECRET', 'test-secret-value-1234567890');
    await setParticipantSession(ME, EVENT_ID);
  });

  it('画面1回ぶんの往復回数と行数を表にする', async () => {
    const results = [];

    seed('ACTIVE');
    results.push(await measure('状態の取得（ゲーム中）', () => getGameState()));

    seed('SPY_MISSION_REVEALED');
    results.push(await measure('状態の取得（SPY公開後）', () => getGameState()));

    seed('VOTING');
    results.push(await measure('投票先の一覧', () => listVoteCandidates()));

    seed('ACTIVE');
    const repo = new SupabaseRepo();
    results.push(await measure('SPYの自動選出', () => repo.setParticipantRoles(EVENT_ID, ['p1'])));
    results.push(await measure('達成状況の集計', () => repo.missionProgress(EVENT_ID)));
    results.push(await measure('人数の数え上げ', () => repo.countParticipants(EVENT_ID)));

    const table = results.map((r) => ({
      処理: r.name,
      往復: r.trips,
      運ぶ行数: r.rows,
      '1回の待ち時間の目安(ms)': r.trips * ROUND_TRIP_MS,
      [`${PEOPLE}人が同時なら(問い合わせ件数)`]: r.trips * PEOPLE,
      エラー: r.error || '',
    }));
    console.log('\n■ 画面1回ぶんのコスト（1往復 ' + ROUND_TRIP_MS + 'ms で換算）');
    console.table(table);

    // 定常状態（全員が画面を開いたまま15秒おきに更新）
    const stateTrips = results[0].trips;
    const perMinute = (PEOPLE * (60 / 15) * stateTrips).toFixed(0);
    console.log(`\n■ 定常状態：${PEOPLE}人が15秒おきに状態を取得`);
    console.log(
      `   1分あたりのデータベース問い合わせ ≒ ${perMinute} 件（毎秒 ${(Number(perMinute) / 60).toFixed(1)} 件）`,
    );
    console.log(`   ※ 画面を閉じている人は問い合わせないので、実際はこれより少ない`);

    console.log(`\n■ フェーズ変更の瞬間：${PEOPLE}人が1.5秒に散らばって一斉に取得`);
    console.log(
      `   ${PEOPLE * stateTrips} 件を1.5秒で ≒ 毎秒 ${Math.round((PEOPLE * stateTrips) / 1.5)} 件`,
    );

    for (const r of results) {
      console.log(`\n${r.name}: ${r.list.join(', ')}`);
    }
  });
});
