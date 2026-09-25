import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { adminLogin, listAdminParticipants, registerParticipant } from '@/server/service/admin';
import { loginParticipant, noteEntered } from '@/server/service/participant';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 「入場」の記録。
 *
 * 受付でQRカードを配っても、その人が読み込めたかは分からない。
 * 読めていない人は、席についてから「入れません」と言いに来ることになる。
 * 受付のうちに気づけるよう、最初に入れた時刻を残す。
 *
 * いちばん怖いのは、この記録のせいでログインが失敗すること。
 * 当日ログインできないのは致命的なので、記録は失敗しても黙って諦める。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('入場の記録', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('登録しただけでは「まだ入っていない」', async () => {
    const { participant } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '受付したばかりの人',
      loginId: '900',
    });

    expect(participant.enteredAt).toBeNull();
    const row = (await listAdminParticipants(DEMO_EVENT_ID)).find((r) => r.id === participant.id);
    expect(row!.enteredAt).toBeNull();
  });

  it('ID・パスワードで入れたら記録される', async () => {
    const { participant, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '入った人',
      loginId: '901',
    });

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });

    const after = await getRepo().getParticipant(participant.id);
    expect(after!.enteredAt).not.toBeNull();
  });

  it('2回目以降に入っても、最初の時刻のまま', async () => {
    const { participant, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '入り直した人',
      loginId: '902',
    });

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });
    const first = (await getRepo().getParticipant(participant.id))!.enteredAt;

    await new Promise((r) => setTimeout(r, 5));
    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });

    expect((await getRepo().getParticipant(participant.id))!.enteredAt).toBe(first);
  });

  it('記録に失敗しても、ログインは止めない', async () => {
    // 列がまだ無いデータベースでも当日ログインが落ちないこと
    const repo = getRepo();
    const broken = vi
      .spyOn(repo, 'markParticipantEntered')
      .mockRejectedValue(new Error('列がありません'));

    const { credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '記録が壊れている人',
      loginId: '903',
    });

    cookieJar.clear();
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: credentials.loginId,
        password: credentials.password,
      }),
    ).resolves.toMatchObject({ eventId: DEMO_EVENT_ID });

    expect(broken).toHaveBeenCalled();
    broken.mockRestore();
  });

  it('印を付ける処理そのものも、失敗を外へ出さない', async () => {
    const broken = vi
      .spyOn(getRepo(), 'markParticipantEntered')
      .mockRejectedValue(new Error('書けません'));

    await expect(noteEntered('だれか')).resolves.toBeUndefined();

    broken.mockRestore();
  });

  it('運営の一覧に入場済みが出る', async () => {
    const { participant, credentials } = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '一覧で見る人',
      loginId: '904',
    });

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: credentials.loginId,
      password: credentials.password,
    });

    cookieJar.clear();
    await loginAsAdmin();
    const row = (await listAdminParticipants(DEMO_EVENT_ID)).find((r) => r.id === participant.id);
    expect(row!.enteredAt).not.toBeNull();
  });
});
