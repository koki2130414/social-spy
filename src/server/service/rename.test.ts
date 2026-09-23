import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { adminLogin, buildJoinUrl, renameParticipant } from '@/server/service/admin';
import {
  DEMO_EVENT_ID,
  DEMO_AGENT_PARTICIPANT_ID,
  DEMO_SPY_PARTICIPANT_ID,
} from '@/server/demo/seed';

/**
 * 表示名の変更。
 *
 * 受付で聞き間違えた、SNSでの名前にそろえたい、といったときに使う。
 *
 * いちばん怖いのは、名前を変えたせいで配ったQRカードが使えなくなること。
 * QRは参加者IDに紐づいているので変わらないはずだが、
 * うっかり作り直す実装にすると当日カードが全部ただの紙になる。
 * ここで固定しておく。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

describe('表示名の変更', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('名前を変えても、配ったQRはそのまま使える', async () => {
    const before = buildJoinUrl(DEMO_AGENT_PARTICIPANT_ID, DEMO_EVENT_ID);

    await renameParticipant(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, 'まいと');

    const after = buildJoinUrl(DEMO_AGENT_PARTICIPANT_ID, DEMO_EVENT_ID);
    expect(after).toBe(before);
    expect((await getRepo().getParticipant(DEMO_AGENT_PARTICIPANT_ID))!.displayName).toBe('まいと');
  });

  it('前後の空白は落とす', async () => {
    const p = await renameParticipant(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, '  ジョナさん  ');
    expect(p.displayName).toBe('ジョナさん');
  });

  it('同じイベントに同じ名前は作れない', async () => {
    const other = await getRepo().getParticipant(DEMO_SPY_PARTICIPANT_ID);

    await expect(
      renameParticipant(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, other!.displayName),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
  });

  it('自分自身と同じ名前にするのは（何も変わらないので）通る', async () => {
    const me = await getRepo().getParticipant(DEMO_AGENT_PARTICIPANT_ID);
    const p = await renameParticipant(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, me!.displayName);
    expect(p.displayName).toBe(me!.displayName);
  });

  it('空の名前は断る', async () => {
    await expect(
      renameParticipant(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, '   '),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('別のイベントの参加者は変えられない', async () => {
    await expect(
      renameParticipant('ev-other-0000', DEMO_AGENT_PARTICIPANT_ID, 'だれか'),
    ).rejects.toThrow();
  });

  it('運営としてログインしていないと変えられない', async () => {
    cookieJar.clear();
    await expect(
      renameParticipant(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, 'だれか'),
    ).rejects.toThrow();
  });

  it('役割・出欠・MISSIONの達成状況は変わらない', async () => {
    const before = await getRepo().getParticipant(DEMO_SPY_PARTICIPANT_ID);
    const missionsBefore = await getRepo().listAssignedMissions(DEMO_SPY_PARTICIPANT_ID);

    await renameParticipant(DEMO_EVENT_ID, DEMO_SPY_PARTICIPANT_ID, 'あたらしい名前');

    const after = await getRepo().getParticipant(DEMO_SPY_PARTICIPANT_ID);
    expect(after!.role).toBe(before!.role);
    expect(after!.attending).toBe(before!.attending);
    expect(after!.loginId).toBe(before!.loginId);
    expect(await getRepo().listAssignedMissions(DEMO_SPY_PARTICIPANT_ID)).toHaveLength(
      missionsBefore.length,
    );
  });
});
