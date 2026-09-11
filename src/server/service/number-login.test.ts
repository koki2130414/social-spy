import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { registerParticipant, adminLogin } from '@/server/service/admin';
import { loginParticipant } from '@/server/service/participant';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 受付で渡す番号でそのまま入場できること。
 *
 * 「あなたは42番」と番号札を渡し、参加者は 42 と打って入る。
 * 以前はIDを4文字以上に制限していたため、この運用ができなかった。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('番号での登録と入場', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('番号を指定して登録でき、その番号で入場できる', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '田中 太郎',
      loginId: '42',
    });

    expect(created.credentials.loginId).toBe('42');

    const session = await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '42',
      password: created.credentials.password,
    });
    expect(session.participantId).toBe(created.participant.id);
  });

  it('1桁の番号でも使える', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '佐藤 花子',
      loginId: '7',
    });
    const session = await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '7',
      password: created.credentials.password,
    });
    expect(session.participantId).toBe(created.participant.id);
  });

  it('同じ番号は二人に渡せない', async () => {
    await registerParticipant(DEMO_EVENT_ID, { displayName: '一人目', loginId: '10' });

    await expect(
      registerParticipant(DEMO_EVENT_ID, { displayName: '二人目', loginId: '10' }),
    ).rejects.toThrow();
  });

  it('番号が合っていてもパスワードが違えば入れない', async () => {
    await registerParticipant(DEMO_EVENT_ID, { displayName: '田中 太郎', loginId: '42' });

    await expect(
      loginParticipant({ code: DEMO_EVENT_CODE, loginId: '42', password: 'wrong-password' }),
    ).rejects.toThrow();
  });

  it('番号を空にすれば、これまで通り自動でIDが発行される', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, { displayName: '山田 花子' });

    expect(created.credentials.loginId).toMatch(/^agent-/);
  });
});
