import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import type { RankingRow } from '@/lib/types';
import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { setParticipantSession } from '@/server/auth/session';
import {
  DEMO_AGENT_PARTICIPANT_ID,
  DEMO_EVENT_ID,
  DEMO_SPY_PARTICIPANT_ID,
} from '@/server/demo/seed';
import { adminLogin, changePhase, setParticipantAttendance } from './admin';
import { getRanking } from './participant';
import { buildRanking, clearRankingCache } from './ranking';

/**
 * 達成率ランキングの約束ごと。
 *
 * いちばん大事なのは「正体公開前に SPY MISSION を達成率へ入れない」こと。
 * 入れてしまうと SPY MISSION 公開の瞬間に SPY だけ達成率が落ち、
 * ランキングを眺めているだけで誰が SPY か分かってしまう。
 *
 * その判定を呼び出し側に任せず buildRanking の中だけで行っているので、
 * ここではフェーズを進めながら実際の値が変わらないことを確かめる。
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

/** SPY本人として、配られたSPY MISSIONをすべて達成済みにする */
async function completeAllSpyMissions(participantId: string) {
  const repo = getRepo();
  const assigned = await repo.listAssignedMissions(participantId, 'SPY');
  for (const m of assigned) {
    await repo.setMissionCompleted(participantId, m.assignmentId, true);
  }
  return assigned.length;
}

function rowOf(rows: RankingRow[], id: string) {
  return rows.find((r) => r.participantId === id);
}

describe('達成率ランキング', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    clearRankingCache();
    await loginAsAdmin();
  });

  it('正体公開前は、SPYがSPY MISSIONを全部達成しても達成率に出ない', async () => {
    const repo = getRepo();
    const event = await repo.getEvent(DEMO_EVENT_ID);

    const before = await buildRanking(DEMO_EVENT_ID, 'ACTIVE');
    const spyBefore = rowOf(before, DEMO_SPY_PARTICIPANT_ID);

    const count = await completeAllSpyMissions(DEMO_SPY_PARTICIPANT_ID);
    expect(count).toBeGreaterThan(0); // 何も達成していなければテストとして意味がない

    clearRankingCache();
    const after = await buildRanking(DEMO_EVENT_ID, 'ACTIVE');
    const spyAfter = rowOf(after, DEMO_SPY_PARTICIPANT_ID);

    expect(spyAfter?.percent).toBe(spyBefore?.percent);
    expect(spyAfter?.total).toBe(spyBefore?.total);
    expect(event).not.toBeNull();
  });

  it('SPY MISSION 公開フェーズでも、SPYの分母は一般参加者と同じままになる', async () => {
    await completeAllSpyMissions(DEMO_SPY_PARTICIPANT_ID);
    clearRankingCache();

    const rows = await buildRanking(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED');
    const spy = rowOf(rows, DEMO_SPY_PARTICIPANT_ID);
    const agent = rowOf(rows, DEMO_AGENT_PARTICIPANT_ID);

    // 分母が違うと、その差だけで誰がSPYか分かってしまう
    expect(spy?.total).toBe(agent?.total);
  });

  it('正体公開後はSPY MISSIONも達成率に入る', async () => {
    await completeAllSpyMissions(DEMO_SPY_PARTICIPANT_ID);
    clearRankingCache();

    const hidden = rowOf(await buildRanking(DEMO_EVENT_ID, 'ACTIVE'), DEMO_SPY_PARTICIPANT_ID);
    clearRankingCache();
    const shown = rowOf(
      await buildRanking(DEMO_EVENT_ID, 'IDENTITY_REVEALED'),
      DEMO_SPY_PARTICIPANT_ID,
    );

    expect(shown!.total).toBeGreaterThan(hidden!.total);
  });

  it('フェーズが変わったら、キャッシュではなく作り直す', async () => {
    await completeAllSpyMissions(DEMO_SPY_PARTICIPANT_ID);
    clearRankingCache();

    const now = Date.now();
    // 同じ時刻＝キャッシュが効く時間内でも、フェーズが違えば作り直されること
    const hidden = rowOf(await buildRanking(DEMO_EVENT_ID, 'ACTIVE', now), DEMO_SPY_PARTICIPANT_ID);
    const shown = rowOf(
      await buildRanking(DEMO_EVENT_ID, 'IDENTITY_REVEALED', now),
      DEMO_SPY_PARTICIPANT_ID,
    );

    expect(shown!.total).toBeGreaterThan(hidden!.total);
  });

  it('数秒以内の2回目はデータベースを読み直さない', async () => {
    const repo = getRepo();
    const spy = vi.spyOn(repo, 'missionProgress');

    const now = Date.now();
    await buildRanking(DEMO_EVENT_ID, 'ACTIVE', now);
    await buildRanking(DEMO_EVENT_ID, 'ACTIVE', now + 1000);
    expect(spy).toHaveBeenCalledTimes(1);

    // 時間が経てば読み直す
    await buildRanking(DEMO_EVENT_ID, 'ACTIVE', now + 60_000);
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });

  it('欠席にした人はランキングに出ない', async () => {
    await setParticipantAttendance(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID, false);
    clearRankingCache();

    const rows = await buildRanking(DEMO_EVENT_ID, 'ACTIVE');
    expect(rowOf(rows, DEMO_AGENT_PARTICIPANT_ID)).toBeUndefined();
  });

  it('参加者向けの応答に role が混ざらない', async () => {
    await changePhase(DEMO_EVENT_ID, 'ACTIVE');
    clearRankingCache();

    cookieJar.clear();
    await setParticipantSession(DEMO_AGENT_PARTICIPANT_ID, DEMO_EVENT_ID);

    const ranking = await getRanking();
    const text = JSON.stringify(ranking);
    expect(text).not.toContain('SPY');
    expect(text).not.toContain('role');
    expect(ranking.me?.participantId).toBe(DEMO_AGENT_PARTICIPANT_ID);
  });
});
