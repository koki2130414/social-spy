import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * データベースの列が増える前にコードだけ先に出てしまった場合でも、
 * 運営の参加者一覧が開けること。
 *
 * ここで例外にすると受付の画面ごと落ちる。当日にそれが起きるのが一番まずいので、
 * 「パスワードは未記録」として続行する。
 */

let failNextSelect = false;

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit', 'neq']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(
      failNextSelect
        ? {
            data: null,
            // Supabase が未知の列を指定されたときに返す形
            error: { message: 'column participants.issued_password does not exist' },
          }
        : { data: [{ id: 'p1', issued_password: '4827' }], error: null },
    ).then(resolve);
  return builder;
}

vi.mock('@/server/supabase/clients', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: (...a: unknown[]) => {
        const b = makeBuilder();
        return (b.select as (...x: unknown[]) => unknown)(...a);
      },
    }),
  }),
}));

import { SupabaseRepo } from './supabase-repo';

describe('パスワード列がまだ無いとき', () => {
  beforeEach(() => {
    failNextSelect = false;
  });

  it('列があれば、そのまま読める', async () => {
    const out = await new SupabaseRepo().listIssuedPasswords('ev-1');
    expect(out).toEqual({ p1: '4827' });
  });

  it('列が無くても例外にせず、空で返す（一覧が開けなくならない）', async () => {
    failNextSelect = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(new SupabaseRepo().listIssuedPasswords('ev-1')).resolves.toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
