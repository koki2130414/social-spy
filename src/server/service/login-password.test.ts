import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { generatePassword, PASSWORD_LENGTH } from '@/lib/core/credentials';
import { MAX_FAILED_ATTEMPTS } from '@/server/auth/login-throttle';
import { adminLogin, registerParticipant, resetParticipantPassword } from '@/server/service/admin';
import { loginParticipant } from '@/server/service/participant';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 受付で渡すパスワードは数字4桁。
 *
 * 打ちやすさを優先したぶん1万通りしかないので、
 * 「間違いが続いたら止める」がセットで効いていることを確かめる。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('パスワードの形', () => {
  it('数字4桁になる', () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generatePassword();
      expect(pw).toMatch(/^[0-9]{4}$/);
      expect(pw).toHaveLength(PASSWORD_LENGTH);
    }
  });

  it('先頭が0でも4桁のまま（数値に変換して桁が落ちない）', () => {
    // 0 を必ず引く乱数で確かめる
    const pw = generatePassword(() => 0);
    expect(pw).toBe('0000');
    expect(pw).toHaveLength(4);
  });
});

describe('数字4桁のパスワードで入場する', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('発行された数字4桁でそのまま入れる', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '受付の人',
      loginId: '42',
    });
    expect(created.credentials.password).toMatch(/^[0-9]{4}$/);

    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: '42',
        password: created.credentials.password,
      }),
    ).resolves.toMatchObject({ participantId: created.participant.id });
  });

  it('間違いが続くとログインを止める', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '打ち間違える人',
      loginId: '43',
    });
    const wrong = created.credentials.password === '0000' ? '1111' : '0000';

    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      await expect(
        loginParticipant({ code: DEMO_EVENT_CODE, loginId: '43', password: wrong }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    // 上限に達した回で止まる
    await expect(
      loginParticipant({ code: DEMO_EVENT_CODE, loginId: '43', password: wrong }),
    ).rejects.toMatchObject({ code: 'LOGIN_LOCKED' });

    // 止まっている間は、正しいパスワードでも受け付けない
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: '43',
        password: created.credentials.password,
      }),
    ).rejects.toMatchObject({ code: 'LOGIN_LOCKED' });
  });

  it('運営がパスワードを再発行すると、その場で入れるようになる', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '受付に来た人',
      loginId: '44',
    });
    const wrong = created.credentials.password === '0000' ? '1111' : '0000';

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await loginParticipant({ code: DEMO_EVENT_CODE, loginId: '44', password: wrong }).catch(
        () => {},
      );
    }
    await expect(
      loginParticipant({ code: DEMO_EVENT_CODE, loginId: '44', password: wrong }),
    ).rejects.toMatchObject({ code: 'LOGIN_LOCKED' });

    cookieJar.clear();
    await loginAsAdmin();
    const reissued = await resetParticipantPassword(DEMO_EVENT_ID, created.participant.id);

    cookieJar.clear();
    await expect(
      loginParticipant({
        code: DEMO_EVENT_CODE,
        loginId: '44',
        password: reissued.password,
      }),
    ).resolves.toMatchObject({ participantId: created.participant.id });
  });

  it('入れたら、数えていた間違いの回数が消える', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '一度だけ間違えた人',
      loginId: '45',
    });
    const wrong = created.credentials.password === '0000' ? '1111' : '0000';

    await loginParticipant({ code: DEMO_EVENT_CODE, loginId: '45', password: wrong }).catch(
      () => {},
    );
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '45',
      password: created.credentials.password,
    });

    const after = await getRepo().getParticipant(created.participant.id);
    expect(after?.failedLoginCount).toBe(0);
    expect(after?.loginLockedUntil).toBeNull();
  });
});
