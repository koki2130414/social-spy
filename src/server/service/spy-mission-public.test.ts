import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { adminLogin, changePhase, listNotifications, updateEvent } from '@/server/service/admin';
import { getGameState } from '@/server/service/participant';
import { setParticipantSession } from '@/server/auth/session';
import {
  DEMO_EVENT_ID,
  DEMO_AGENT_PARTICIPANT_ID,
  DEMO_SPY_PARTICIPANT_ID,
} from '@/server/demo/seed';

/**
 * SPY MISSION を全員に公開するか、しないか。
 *
 * 「公開する」進行では、後半にSPY MISSIONの内容が全員に出る（誰のものかは分からない）。
 * 「公開しない」進行では、最後までSPY本人しか自分のSPY MISSIONを見られない。
 *
 * ここで守りたいのは、公開しない設定のときに
 * 画面で隠すだけでなく、サーバーの応答そのものに含まれないこと。
 * 画面で隠すだけだと、通信を覗けば読めてしまう。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

/** SPY MISSION が公開される段階まで進める */
async function advanceToReveal() {
  await changePhase(DEMO_EVENT_ID, 'ACTIVE');
  await changePhase(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED');
}

async function stateOf(participantId: string) {
  cookieJar.clear();
  await setParticipantSession(participantId, DEMO_EVENT_ID);
  return getGameState();
}

describe('SPY MISSIONを公開する設定', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('既定は「公開する」', async () => {
    expect((await getRepo().getEvent(DEMO_EVENT_ID))!.spyMissionPublic).toBe(true);
  });

  it('公開する設定なら、後半に一般参加者へもSPY MISSIONの内容が出る', async () => {
    await advanceToReveal();

    const me = await stateOf(DEMO_AGENT_PARTICIPANT_ID);
    expect(me.spyMissionsPublic).toBe(true);
    expect(me.spyMissions).not.toBeNull();
    expect(me.spyMissions!.length).toBeGreaterThan(0);
  });
});

describe('SPY MISSIONを公開しない設定', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
    await updateEvent(DEMO_EVENT_ID, { spyMissionPublic: false });
  });

  it('後半に進んでも、一般参加者の応答にSPY MISSIONが入らない', async () => {
    await advanceToReveal();

    const me = await stateOf(DEMO_AGENT_PARTICIPANT_ID);
    expect(me.spyMissionsPublic).toBe(false);
    expect(me.spyMissions).toBeNull();
    // 通信そのものに文字として出ていないこと（画面で隠すだけでは足りない）
    expect(JSON.stringify(me)).not.toContain('"kind":"SPY"');
  });

  it('投票・正体公開まで進んでも出ない', async () => {
    await advanceToReveal();
    cookieJar.clear();
    await loginAsAdmin();
    await changePhase(DEMO_EVENT_ID, 'VOTING');

    let me = await stateOf(DEMO_AGENT_PARTICIPANT_ID);
    expect(me.spyMissions).toBeNull();

    cookieJar.clear();
    await loginAsAdmin();
    await changePhase(DEMO_EVENT_ID, 'IDENTITY_REVEALED');

    me = await stateOf(DEMO_AGENT_PARTICIPANT_ID);
    expect(me.spyMissions).toBeNull();
  });

  it('SPY本人は自分のSPY MISSIONを変わらず見られる', async () => {
    await advanceToReveal();

    const spy = await stateOf(DEMO_SPY_PARTICIPANT_ID);
    expect(spy.me.isSpy).toBe(true);
    expect(spy.spyMissions).not.toBeNull();
    expect(spy.spyMissions!.length).toBeGreaterThan(0);
    // 本人向けなので「全員に公開されている」ではない
    expect(spy.spyMissionsPublic).toBe(false);
  });

  it('「公開しました」というお知らせを出さない', async () => {
    await advanceToReveal();

    const notes = await listNotifications(DEMO_EVENT_ID);
    const titles = notes.map((n) => n.title);
    expect(titles).not.toContain('SPY MISSION REVEALED');
    expect(titles).toContain('FINAL PHASE');
  });

  it('あとから公開する設定に戻せば、その場で全員に出る', async () => {
    await advanceToReveal();
    expect((await stateOf(DEMO_AGENT_PARTICIPANT_ID)).spyMissions).toBeNull();

    cookieJar.clear();
    await loginAsAdmin();
    await updateEvent(DEMO_EVENT_ID, { spyMissionPublic: true });

    const me = await stateOf(DEMO_AGENT_PARTICIPANT_ID);
    expect(me.spyMissions).not.toBeNull();
  });
});
