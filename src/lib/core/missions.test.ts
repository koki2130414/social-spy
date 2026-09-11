import { describe, expect, it } from 'vitest';
import { pickMissionsForParticipant, pickSpyMissions, MISSIONS_PER_PARTICIPANT } from './missions';
import { createRng } from './random';
import type { Mission } from '@/lib/types';
import { GENERAL_MISSION_PRESETS } from './mission-presets';

function mission(
  id: string,
  kind: Mission['kind'] = 'GENERAL',
  active = true,
  difficulty: Mission['difficulty'] = 'NORMAL',
): Mission {
  return {
    id,
    eventId: 'ev1',
    code: `CODE-${id}`,
    title: `title-${id}`,
    body: `body-${id}`,
    kind,
    difficulty,
    active,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** 各段階が2件以上ある、当日と同じ形の候補 */
const POOL: Mission[] = [
  mission('e1', 'GENERAL', true, 'EASY'),
  mission('e2', 'GENERAL', true, 'EASY'),
  mission('n1', 'GENERAL', true, 'NORMAL'),
  mission('n2', 'GENERAL', true, 'NORMAL'),
  mission('h1', 'GENERAL', true, 'HARD'),
  mission('h2', 'GENERAL', true, 'HARD'),
  mission('s1', 'SPY'),
  mission('s2', 'SPY'),
  mission('inactive', 'GENERAL', false),
];

/** id から難易度を引く */
const levelOf = (id: string) => POOL.find((m) => m.id === id)!.difficulty;

/** 本番と同じ内容から作った候補。カードとの一致を見るために使う */
const CARD_POOL: Mission[] = GENERAL_MISSION_PRESETS.map((m, i) => ({
  id: `ms-${i}`,
  eventId: 'ev1',
  code: m.code,
  title: m.title,
  body: m.body,
  kind: 'GENERAL',
  difficulty: m.difficulty,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}));

describe('MISSION 配布', () => {
  it('一般参加者へ3件のMISSIONを配布する', () => {
    const picked = pickMissionsForParticipant(POOL, { rng: createRng(1) });
    expect(picked).toHaveLength(MISSIONS_PER_PARTICIPANT);
    expect(picked.map((p) => p.orderIndex)).toEqual([1, 2, 3]);
  });

  it('同一人物へ同じMISSIONを重複配布しない', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickMissionsForParticipant(POOL, { rng: createRng(seed) });
      const ids = picked.map((p) => p.missionId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('SPY MISSION と無効なMISSIONは一般配布の対象外', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const picked = pickMissionsForParticipant(POOL, { rng: createRng(seed) });
      for (const p of picked) {
        expect(['s1', 's2', 'inactive']).not.toContain(p.missionId);
      }
    }
  });

  it('除外指定したMISSIONは配布されない', () => {
    const picked = pickMissionsForParticipant(POOL, {
      rng: createRng(7),
      excludeMissionIds: ['e1', 'n1', 'h1'],
    });
    expect(picked.map((p) => p.missionId).sort()).toEqual(['e2', 'h2', 'n2']);
  });

  it('候補が3件未満なら、あるだけ配布する（重複はさせない）', () => {
    const picked = pickMissionsForParticipant([mission('g1'), mission('g2')], {
      rng: createRng(3),
    });
    expect(picked).toHaveLength(2);
  });

  it('SPY MISSION は有効なものだけが割り当てられる', () => {
    const spy = pickSpyMissions(POOL);
    expect(spy.map((s) => s.missionId).sort()).toEqual(['s1', 's2']);
  });

  it('イージー・ノーマル・ハードを1つずつ配る', () => {
    // 何度引いても偏らないこと。「ハードが3つ」の人が出ると当日きつい
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickMissionsForParticipant(POOL, { rng: createRng(seed) });
      const levels = picked.map((p) => levelOf(p.missionId));
      expect(levels.sort()).toEqual(['EASY', 'HARD', 'NORMAL']);
    }
  });

  it('易しい順に並べて配る', () => {
    const picked = pickMissionsForParticipant(POOL, { rng: createRng(3) });
    const inOrder = [...picked].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(inOrder.map((p) => levelOf(p.missionId))).toEqual(['EASY', 'NORMAL', 'HARD']);
  });

  it('ある段階が1件も無くても、残りを配る', () => {
    // 運営がハードを全部消してしまった場合でも配布は止めない
    const noHard = POOL.filter((m) => m.difficulty !== 'HARD');
    const picked = pickMissionsForParticipant(noHard, { rng: createRng(5) });
    expect(picked).toHaveLength(MISSIONS_PER_PARTICIPANT);
    const levels = picked.map((p) => noHard.find((m) => m.id === p.missionId)!.difficulty);
    expect(levels).toContain('EASY');
    expect(levels).toContain('NORMAL');
  });

  it('カードのセット単位で配る（N-4を持つ人は必ずH-4を持つ）', () => {
    // 紙のカードとアプリが食い違うと、参加者は手元を見て迷う
    for (let seed = 1; seed <= 60; seed++) {
      const picked = pickMissionsForParticipant(CARD_POOL, { rng: createRng(seed) });
      const codes = picked.map((p) => CARD_POOL.find((m) => m.id === p.missionId)!.code);
      const n = codes.find((c) => c.startsWith('N-'))!.slice(2);
      const h = codes.find((c) => c.startsWith('H-'))!.slice(2);
      expect(h).toBe(n);
    }
  });

  it('カード6の人には、カード6専用のイージーが出る', () => {
    // このカードだけ E-1 の文言が違う。印字と合わせる必要がある
    let sawCard6 = false;
    for (let seed = 1; seed <= 200 && !sawCard6; seed++) {
      const picked = pickMissionsForParticipant(CARD_POOL, { rng: createRng(seed) });
      const chosen = picked.map((p) => CARD_POOL.find((m) => m.id === p.missionId)!);
      if (!chosen.some((m) => m.code === 'N-6')) continue;
      sawCard6 = true;
      const easy = chosen.find((m) => m.difficulty === 'EASY')!;
      expect(easy.body).toBe('共通点が3つある参加者を1人見つけよ。');
    }
    expect(sawCard6).toBe(true);
  });

  it('カード1〜5の人には、共通のイージーが出る', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const picked = pickMissionsForParticipant(CARD_POOL, { rng: createRng(seed) });
      const chosen = picked.map((p) => CARD_POOL.find((m) => m.id === p.missionId)!);
      if (chosen.some((m) => m.code === 'N-6')) continue;
      const easy = chosen.find((m) => m.difficulty === 'EASY')!;
      expect(easy.body).toBe('3人の参加者と会話し、SNSを交換せよ。');
    }
  });

  it('6枚すべてのカードが配られうる', () => {
    const seenCards = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const picked = pickMissionsForParticipant(CARD_POOL, { rng: createRng(seed) });
      const codes = picked.map((p) => CARD_POOL.find((m) => m.id === p.missionId)!.code);
      seenCards.add(codes.find((c) => c.startsWith('N-'))!.slice(2));
    }
    expect([...seenCards].sort()).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});
