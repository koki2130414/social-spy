import { beforeEach, describe, expect, it } from 'vitest';
import { DemoRepo, resetDemoState } from '@/server/repo/demo-repo';
import { DEMO_EVENT_ID } from '@/server/demo/seed';
import { MISSIONS_PER_PARTICIPANT } from '@/lib/core/missions';
import type { Repo } from '@/server/repo/types';

/**
 * MISSION の一括配布。
 *
 * ここでは配布結果の正しさだけを見る。
 * データベースへの往復回数は repo/distribute-missions.test.ts で数える
 * （DemoRepo は往復しないので、そちらでは測れない）。
 */

async function addParticipants(repo: Repo, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await repo.createParticipant({
      eventId: DEMO_EVENT_ID,
      displayName: `参加者${i}`,
      affiliation: null,
    });
  }
}

describe('MISSIONの一括配布', () => {
  beforeEach(() => {
    resetDemoState();
  });

  it('全員に3件ずつ配る', async () => {
    const repo = new DemoRepo();
    await addParticipants(repo, 30);
    const before = await repo.listParticipants(DEMO_EVENT_ID);

    const { assigned } = await repo.distributeGeneralMissions(DEMO_EVENT_ID);

    // デモ初期データの12人は配布済みなので、追加した30人だけが対象
    expect(assigned).toBe(30);
    for (const p of before) {
      const mine = await repo.listAssignedMissions(p.id, 'GENERAL');
      expect(mine.length).toBe(MISSIONS_PER_PARTICIPANT);
    }
  });

  it('二度押しても重複して配らない', async () => {
    const repo = new DemoRepo();
    await addParticipants(repo, 10);
    await repo.distributeGeneralMissions(DEMO_EVENT_ID);
    const second = await repo.distributeGeneralMissions(DEMO_EVENT_ID);

    expect(second.assigned).toBe(0);
    const all = await repo.listParticipants(DEMO_EVENT_ID);
    for (const p of all) {
      const mine = await repo.listAssignedMissions(p.id, 'GENERAL');
      expect(mine.length).toBe(MISSIONS_PER_PARTICIPANT);
    }
  });
});
