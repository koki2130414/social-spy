import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { getRepo } from '@/server/repo';
import { adminLogin, changePhase } from '@/server/service/admin';
import { castVotes, getGameState, getResultForParticipant } from '@/server/service/participant';
import { clearRankingCache } from '@/server/service/ranking';
import { MAX_VOTE_TARGETS } from '@/lib/core/vote';
import {
  DEMO_EVENT_ID,
  DEMO_SPY_PARTICIPANT_ID,
  DEMO_AGENT_PARTICIPANT_ID,
} from '@/server/demo/seed';

/**
 * SPYだと思う人を複数選ぶ投票。
 *
 * 当日いちばん揉めるのは「不正に全員選んだ人が勝つ」ことなので、
 * 上限をサーバー側で必ず弾くこと。画面の作り変えやAPIの直叩きでも抜けないよう、
 * データベース側にもトリガを置いてある（20260101000900_multi_vote.sql）。
 *
 * ここで守りたいのは次の5つ。
 *  ・10人までしか選べないこと
 *  ・1人も選ばずに送れないこと
 *  ・同じ人を2回選んでも1人ぶんになること
 *  ・送信後は変更できないこと
 *  ・当てた数が正しく数えられること
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

/** 投票フェーズまで進める */
async function openVoting() {
  await changePhase(DEMO_EVENT_ID, 'ACTIVE');
  await changePhase(DEMO_EVENT_ID, 'SPY_MISSION_REVEALED');
  await changePhase(DEMO_EVENT_ID, 'VOTING');
}

describe('複数選ぶ投票', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    clearRankingCache();
    await loginAsAdmin();
    await openVoting();
  });

  it('10人まで選べる', async () => {
    const others = (await getRepo().listParticipants(DEMO_EVENT_ID))
      .filter((p) => p.id !== DEMO_AGENT_PARTICIPANT_ID)
      .slice(0, MAX_VOTE_TARGETS);
    expect(others).toHaveLength(MAX_VOTE_TARGETS);

    cookieJar.clear();
    await castVotesAs(
      DEMO_AGENT_PARTICIPANT_ID,
      others.map((p) => p.id),
    );

    const state = await getGameState();
    expect(state.votedTargetIds).toHaveLength(MAX_VOTE_TARGETS);
  });

  it('11人以上は選べない（画面を作り変えても通らない）', async () => {
    const others = (await getRepo().listParticipants(DEMO_EVENT_ID))
      .filter((p) => p.id !== DEMO_AGENT_PARTICIPANT_ID)
      .slice(0, MAX_VOTE_TARGETS + 1);

    await expect(
      castVotesAs(
        DEMO_AGENT_PARTICIPANT_ID,
        others.map((p) => p.id),
      ),
    ).rejects.toMatchObject({ code: 'TOO_MANY_TARGETS' });

    // 弾かれたときは1票も残らない
    const votes = await getRepo().listVotesByVoter(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID);
    expect(votes).toHaveLength(0);
  });

  it('1人も選ばずには送れない', async () => {
    await expect(castVotesAs(DEMO_AGENT_PARTICIPANT_ID, [])).rejects.toMatchObject({
      code: 'NO_TARGET_SELECTED',
    });
  });

  it('同じ人を2回選んでも1人ぶんになる（二度押し対策）', async () => {
    await castVotesAs(DEMO_AGENT_PARTICIPANT_ID, [
      DEMO_SPY_PARTICIPANT_ID,
      DEMO_SPY_PARTICIPANT_ID,
    ]);
    const votes = await getRepo().listVotesByVoter(DEMO_EVENT_ID, DEMO_AGENT_PARTICIPANT_ID);
    expect(votes).toHaveLength(1);
  });

  it('自分自身は選べない', async () => {
    await expect(
      castVotesAs(DEMO_AGENT_PARTICIPANT_ID, [DEMO_AGENT_PARTICIPANT_ID]),
    ).rejects.toMatchObject({ code: 'SELF_VOTE_FORBIDDEN' });
  });

  it('送信後は追加も変更もできない', async () => {
    await castVotesAs(DEMO_AGENT_PARTICIPANT_ID, [DEMO_SPY_PARTICIPANT_ID]);
    await expect(castVotes([DEMO_SPY_PARTICIPANT_ID])).rejects.toMatchObject({
      code: 'ALREADY_VOTED',
    });
  });

  it('当てた数が結果に出る（外した分は数えない）', async () => {
    const participants = await getRepo().listParticipants(DEMO_EVENT_ID);
    const spies = participants.filter((p) => p.role === 'SPY');
    const notSpy = participants.find(
      (p) => p.role !== 'SPY' && p.id !== DEMO_AGENT_PARTICIPANT_ID,
    )!;

    await castVotesAs(DEMO_AGENT_PARTICIPANT_ID, [spies[0].id, notSpy.id]);

    cookieJar.clear();
    await loginAsAdmin();
    await changePhase(DEMO_EVENT_ID, 'IDENTITY_REVEALED');
    clearRankingCache();

    cookieJar.clear();
    await setSession(DEMO_AGENT_PARTICIPANT_ID);
    const result = await getResultForParticipant();

    expect(result.myPicks).toHaveLength(2);
    expect(result.myCorrectSpies).toBe(1);
    // SPYを当てた人として名前が出る
    expect(result.catchers.some((c) => c.participantId === DEMO_AGENT_PARTICIPANT_ID)).toBe(true);
    // 総合順位にも反映される
    const me = result.finalRanking.find((r) => r.participantId === DEMO_AGENT_PARTICIPANT_ID);
    expect(me?.correctSpies).toBe(1);
    expect(me?.picked).toBe(2);
  });

  it('SPYを当てられなかった人は一覧に出ない', async () => {
    const notSpy = (await getRepo().listParticipants(DEMO_EVENT_ID)).find(
      (p) => p.role !== 'SPY' && p.id !== DEMO_AGENT_PARTICIPANT_ID,
    )!;
    await castVotesAs(DEMO_AGENT_PARTICIPANT_ID, [notSpy.id]);

    cookieJar.clear();
    await loginAsAdmin();
    await changePhase(DEMO_EVENT_ID, 'IDENTITY_REVEALED');
    clearRankingCache();

    cookieJar.clear();
    await setSession(DEMO_AGENT_PARTICIPANT_ID);
    const result = await getResultForParticipant();
    expect(result.catchers.some((c) => c.participantId === DEMO_AGENT_PARTICIPANT_ID)).toBe(false);
    expect(result.myCorrectSpies).toBe(0);
  });
});

/* --- 補助 --- */

async function setSession(participantId: string) {
  const { setParticipantSession } = await import('@/server/auth/session');
  await setParticipantSession(participantId, DEMO_EVENT_ID);
}

async function castVotesAs(participantId: string, targetIds: string[]) {
  cookieJar.clear();
  await setSession(participantId);
  return castVotes(targetIds);
}
