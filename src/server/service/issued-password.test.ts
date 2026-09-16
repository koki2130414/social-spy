import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import {
  adminLogin,
  listAdminParticipants,
  registerParticipant,
  resetParticipantPassword,
} from '@/server/service/admin';
import {
  getGameState,
  listVoteCandidates,
  loginParticipant,
  getRanking,
} from '@/server/service/participant';
import { clearRankingCache } from '@/server/service/ranking';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 運営画面でパスワードが見えること、そして
 * それが参加者側へは絶対に出ないこと。
 *
 * 当日「紙をなくした」と言われたときに運営が答えられるようにするため、
 * 発行した数字4桁を保存している。表示先を1か所でも間違えると、
 * 誰でも他人になりすませてしまう。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('運営画面のパスワード表示', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    clearRankingCache();
    await loginAsAdmin();
  });

  it('登録したパスワードが運営の一覧に出る', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '受付の人',
      loginId: '51',
    });

    const rows = await listAdminParticipants(DEMO_EVENT_ID);
    const row = rows.find((r) => r.id === created.participant.id);
    expect(row?.issuedPassword).toBe(created.credentials.password);
    expect(row?.issuedPassword).toMatch(/^[0-9]{4}$/);
  });

  it('再発行すると一覧の表示も新しい番号に変わる', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '作り直す人',
      loginId: '52',
    });
    const before = created.credentials.password;

    const reissued = await resetParticipantPassword(DEMO_EVENT_ID, created.participant.id);
    const rows = await listAdminParticipants(DEMO_EVENT_ID);
    const row = rows.find((r) => r.id === created.participant.id);

    expect(row?.issuedPassword).toBe(reissued.password);
    // 画面に出る値と、実際に入れる値がずれていないこと
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: '52',
        password: row!.issuedPassword!,
      }),
    ).resolves.toMatchObject({ participantId: created.participant.id });
    expect(before).not.toBe(reissued.password);
  });

  it('参加者向けの応答にはパスワードが一切含まれない', async () => {
    const other = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '他人',
      loginId: '53',
    });
    const me = await registerParticipant(DEMO_EVENT_ID, {
      displayName: 'ログインする人',
      loginId: '54',
    });

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '54',
      password: me.credentials.password,
    });

    const payloads = [await getGameState(), await listVoteCandidates(), await getRanking()];

    /**
     * 値そのものを1つずつ見る。
     * 文字列全体に対する部分一致で調べると、パスワードがたまたま "2026" のとき
     * 日時の "2026-01-01..." に引っかかって、漏れていないのに失敗してしまう。
     */
    const keys: string[] = [];
    const values: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          keys.push(k);
          walk(v);
        }
        return;
      }
      if (typeof node === 'string') values.push(node);
    };
    payloads.forEach(walk);

    // 他人のぶんはもちろん、自分のぶんも参加者APIには載せない
    expect(values).not.toContain(other.credentials.password);
    expect(values).not.toContain(me.credentials.password);
    expect(keys).not.toContain('issuedPassword');
    expect(keys).not.toContain('password');
    // 調べる対象が空でないこと（テストが素通りしていないことの確認）
    expect(keys.length).toBeGreaterThan(10);
  });
});
