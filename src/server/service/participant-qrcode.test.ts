import { beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import {
  adminLogin,
  buildJoinUrl,
  createEvent,
  getParticipantQrCode,
  registerParticipant,
} from '@/server/service/admin';
import { getGameState, listVoteCandidates, loginParticipant } from '@/server/service/participant';
import { verifyJoinToken } from '@/server/auth/session';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 運営画面から出す「その人1人ぶんのQR」。
 *
 * 当日、配った受付カードをなくした人に画面を見せて読んでもらうためのもの。
 * 読むとその人としてログインするので、配ったカードと同じ強さの鍵になる。
 *
 * ここで守りたいのは次の3つ。
 *  ・運営としてログインしていないと取れないこと
 *  ・他会場（別イベント）の人のQRを、IDを差し替えて取れないこと
 *  ・参加者向けの画面・APIに、この鍵が一切出てこないこと
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('参加者1人ぶんのQR', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('読み取るとその人としてログインするリンクが入っている', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: 'カードをなくした人',
      loginId: '90',
    });

    const qr = await getParticipantQrCode(DEMO_EVENT_ID, created.participant.id);

    // 配ったカードのQRと同じリンクであること（両方使えるのが狙い）
    expect(qr.joinUrl).toBe(buildJoinUrl(created.participant.id, DEMO_EVENT_ID));
    // そのリンクが本当にこの人を指していること
    expect(verifyJoinToken(qr.joinUrl.split('/j/')[1])).toMatchObject({
      pid: created.participant.id,
      eid: DEMO_EVENT_ID,
    });
    expect(qr.displayName).toBe('カードをなくした人');
    expect(qr.loginId).toBe('90');
  });

  it('画像が、別のURLではなくこの人のリンクを符号化している', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '確認用',
      loginId: '91',
    });
    const qr = await getParticipantQrCode(DEMO_EVENT_ID, created.participant.id);

    // 同じ設定で作り直したものと一致するか。
    // 一致すれば、画像は joinUrl そのものを符号化している
    // （イベントのコードなど、別の文字列を入れてしまう取り違えを防ぐ）
    const expected = await QRCode.toDataURL(qr.joinUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
    expect(qr.dataUrl).toBe(expected);
    expect(qr.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('運営としてログインしていないと取れない', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '他人',
      loginId: '92',
    });

    cookieJar.clear();
    await expect(getParticipantQrCode(DEMO_EVENT_ID, created.participant.id)).rejects.toThrow();
  });

  it('参加者としてログインしていても取れない（なりすましの踏み台にしない）', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '本人',
      loginId: '93',
    });
    const other = await registerParticipant(DEMO_EVENT_ID, {
      displayName: 'ねらわれた人',
      loginId: '94',
    });

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '93',
      password: created.credentials.password,
    });

    await expect(getParticipantQrCode(DEMO_EVENT_ID, other.participant.id)).rejects.toThrow();
  });

  it('別イベントの参加者IDを渡しても取れない', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '別会場の人',
      loginId: '95',
    });
    const otherEvent = await createEvent({
      name: '別の会場',
      code: 'OTHER1',
      startsAt: '2026-09-25T10:00:00.000Z',
      durationMinutes: 90,
      spyRevealOffsetMinutes: 60,
      spyCount: 2,
      spyMissionPublic: true,
      registrationOpen: true,
    });

    await expect(getParticipantQrCode(otherEvent.id, created.participant.id)).rejects.toMatchObject(
      { code: 'PARTICIPANT_NOT_FOUND' },
    );
  });

  it('参加者向けの画面・APIにQRもリンクも出てこない', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '参加者',
      loginId: '96',
    });
    await registerParticipant(DEMO_EVENT_ID, { displayName: '仲間', loginId: '97' });

    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '96',
      password: created.credentials.password,
    });

    const payloads = JSON.stringify([await getGameState(), await listVoteCandidates()]);
    expect(payloads).not.toContain('/j/');
    expect(payloads).not.toContain('data:image');
    expect(payloads.toLowerCase()).not.toContain('joinurl');
  });
});
