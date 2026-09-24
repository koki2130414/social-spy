import { describe, expect, it } from 'vitest';
import { visibleSpyMissions } from './intel';
import { isSpyMissionShared } from './phase';
import { toPublicParticipant } from './spy';
import type { AssignedMission, Participant } from '@/lib/types';

const spyMission: AssignedMission = {
  assignmentId: 'a1',
  missionId: 'm1',
  orderIndex: 1,
  code: 'INFORMATION GATHERING',
  title: '情報収集',
  body: '5人以上の参加者から、現在取り組んでいる活動について情報を集めよ。',
  kind: 'SPY',
  difficulty: 'NORMAL',
  completed: false,
  completedAt: null,
};

describe('SPY情報の可視性', () => {
  it('公開前、一般参加者にはSPY MISSIONが一切表示されない', () => {
    for (const phase of ['LOBBY', 'ACTIVE'] as const) {
      const visible = visibleSpyMissions({
        shared: isSpyMissionShared({ phase, spyMissionPublic: true }),
        isSpy: false,
        ownSpyMissions: [],
        publicSpyMissions: [spyMission],
      });
      expect(visible).toBeNull();
    }
  });

  it('公開後は一般参加者にもSPY MISSIONの内容が表示される', () => {
    for (const phase of [
      'SPY_MISSION_REVEALED',
      'VOTING',
      'IDENTITY_REVEALED',
      'FINISHED',
    ] as const) {
      const visible = visibleSpyMissions({
        shared: isSpyMissionShared({ phase, spyMissionPublic: true }),
        isSpy: false,
        ownSpyMissions: [],
        publicSpyMissions: [spyMission],
      });
      expect(visible).toEqual([spyMission]);
    }
  });

  it('「公開しない」設定なら、公開のフェーズでも一般参加者には出ない', () => {
    // 設定を切ったときは、フェーズが進んでいても見せない。
    // 画面で隠すのではなく、そもそも渡さないための判定
    for (const phase of ['SPY_MISSION_REVEALED', 'VOTING', 'FINISHED'] as const) {
      const visible = visibleSpyMissions({
        shared: isSpyMissionShared({ phase, spyMissionPublic: false }),
        isSpy: false,
        ownSpyMissions: [],
        publicSpyMissions: [spyMission],
      });
      expect(visible).toBeNull();
    }
  });

  it('「公開しない」設定でも、SPY本人は自分のSPY MISSIONを見られる', () => {
    const visible = visibleSpyMissions({
      shared: isSpyMissionShared({ phase: 'VOTING', spyMissionPublic: false }),
      isSpy: true,
      ownSpyMissions: [spyMission],
      publicSpyMissions: [],
    });
    expect(visible).toEqual([spyMission]);
  });

  it('SPY本人は公開前でも自分のSPY MISSIONを見られる', () => {
    const visible = visibleSpyMissions({
      shared: false,
      isSpy: true,
      ownSpyMissions: [spyMission],
      publicSpyMissions: [],
    });
    expect(visible).toEqual([spyMission]);
  });
});

describe('参加者情報の公開', () => {
  it('公開用に変換すると role が消える', () => {
    const participant: Participant = {
      id: 'p1',
      eventId: 'ev1',
      displayName: '鈴木 玲奈',
      affiliation: 'スタートアップ / 広報',
      loginId: null,
      attending: true,
      failedLoginCount: 0,
      loginLockedUntil: null,
      role: 'SPY',
      joinedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const publicView = toPublicParticipant(participant);
    expect(Object.keys(publicView)).not.toContain('role');
    expect(JSON.stringify(publicView)).not.toContain('SPY');
  });
});
