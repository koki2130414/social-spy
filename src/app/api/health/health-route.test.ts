import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 死活確認エンドポイントの取り決め。
 *
 * ここが守られないと、当日の「動いているか？」の確認が
 * あてにならなくなる。
 *
 *  1. 実際にデータベースへ問い合わせる
 *     （問い合わせないと Supabase の自動停止を防げないし、
 *       DBが死んでいても ok:true を返してしまう）
 *  2. 失敗したら 503 を返す（監視が異常に気づけるようにする）
 *  3. 失敗しても中身を漏らさない（接続情報が混ざる恐れがあるため）
 */

const listEvents = vi.fn();

vi.mock('@/server/repo', () => ({
  getRepo: () => ({ kind: 'supabase', listEvents }),
}));

vi.mock('@/lib/env', () => ({
  appMode: () => 'supabase',
}));

async function callHealth() {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetModules();
  listEvents.mockReset();
});

describe('GET /api/health', () => {
  it('データベースへ実際に問い合わせる', async () => {
    listEvents.mockResolvedValue([]);
    const { res, body } = await callHealth();

    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe('ok');
  });

  it('データベースが落ちていたら 503 を返す', async () => {
    listEvents.mockRejectedValue(new Error('connection refused'));
    const { res, body } = await callHealth();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.db).toBe('error');
  });

  it('失敗時にエラーの中身を漏らさない', async () => {
    listEvents.mockRejectedValue(new Error('postgres://user:pa55word@db.example'));
    const { body } = await callHealth();

    const text = JSON.stringify(body);
    expect(text).not.toContain('pa55word');
    expect(text).not.toContain('postgres://');
  });

  it('参加者やイベントの中身を返さない', async () => {
    listEvents.mockResolvedValue([{ id: 'e1', name: 'BUZZ BASE 交流会 9/25', code: 'BUZZ0925' }]);
    const { body } = await callHealth();

    const text = JSON.stringify(body);
    expect(text).not.toContain('BUZZ0925');
    expect(text).not.toContain('BUZZ BASE');
    expect(Object.keys(body).sort()).toEqual(['db', 'mode', 'ms', 'ok']);
  });

  it('キャッシュされない（古い結果で生死を誤判定しない）', async () => {
    listEvents.mockResolvedValue([]);
    const { res } = await callHealth();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
