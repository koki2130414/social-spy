import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { adminLogin, autoAssignSpies, setParticipantAttendance } from '@/server/service/admin';
import { DEMO_EVENT_ID } from '@/server/demo/seed';

/**
 * 自動選出のときにSPYの人数をその場で決められること。
 *
 * 当日は「思ったより来なかった」「増えた」が普通に起きる。
 * イベントの設定を開き直さなくても、選出のときに人数を指定できるようにした。
 *
 * ここで守りたいのは次の3つ。
 *  ・指定した人数ちょうどが選ばれること
 *  ・指定した人数がイベントの設定にも残ること
 *    （残らないと、画面のボタンに出る人数と実際がずれて当日混乱する）
 *  ・出席者より多い人数を指定しても壊れないこと
 */

async function spies() {
  return (await getRepo().listParticipants(DEMO_EVENT_ID)).filter((p) => p.role === 'SPY');
}

describe('SPYの人数を指定して自動選出', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
  });

  it('指定した人数ちょうどが選ばれる', async () => {
    await autoAssignSpies(DEMO_EVENT_ID, 4);
    expect(await spies()).toHaveLength(4);

    // 選び直しても増えない（前の役割は戻る）
    await autoAssignSpies(DEMO_EVENT_ID, 2);
    expect(await spies()).toHaveLength(2);
  });

  it('指定した人数がイベントの設定にも残る', async () => {
    await autoAssignSpies(DEMO_EVENT_ID, 4);

    const event = await getRepo().getEvent(DEMO_EVENT_ID);
    expect(event!.spyCount).toBe(4);
  });

  it('人数を指定しなければ、イベントの設定どおりに選ばれる', async () => {
    const event = await getRepo().getEvent(DEMO_EVENT_ID);
    await autoAssignSpies(DEMO_EVENT_ID);

    expect(await spies()).toHaveLength(event!.spyCount);
  });

  it('出席者より多い人数を指定しても壊れない（出席者が上限）', async () => {
    const all = await getRepo().listParticipants(DEMO_EVENT_ID);
    // 半分を欠席にしてから、全員より多い人数を指定する
    for (const p of all.slice(0, Math.floor(all.length / 2))) {
      await setParticipantAttendance(DEMO_EVENT_ID, p.id, false);
    }
    const present = (await getRepo().listParticipants(DEMO_EVENT_ID)).filter((p) => p.attending);

    await autoAssignSpies(DEMO_EVENT_ID, 20);

    const chosen = await spies();
    expect(chosen).toHaveLength(present.length);
    // 欠席の人はSPYに選ばれない
    expect(chosen.every((p) => p.attending)).toBe(true);
  });

  it('0人を指定すると、SPYがいない状態にできる', async () => {
    await autoAssignSpies(DEMO_EVENT_ID, 3);
    expect(await spies()).toHaveLength(3);

    await autoAssignSpies(DEMO_EVENT_ID, 0);
    expect(await spies()).toHaveLength(0);
  });

  it('運営としてログインしていないと選出できない', async () => {
    cookieJar.clear();
    await expect(autoAssignSpies(DEMO_EVENT_ID, 3)).rejects.toThrow();
  });
});
