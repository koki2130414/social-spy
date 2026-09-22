import { describe, expect, it } from 'vitest';
import { nextPollDelay, realtimeJitter } from './polling';

/**
 * 「同時に叩かない」ための計算。
 *
 * 当日いちばん重くなるのはフェーズが変わった瞬間で、
 * 101台が同時に問い合わせる。ここがずれていないと山が平らにならない。
 */

describe('定期更新の間隔', () => {
  it('人が待てる範囲に収まる（基準の±20%）', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const d = nextPollDelay(15000, () => r);
      expect(d).toBeGreaterThanOrEqual(12000);
      expect(d).toBeLessThanOrEqual(18000);
    }
  });

  it('端末ごとに違う値になる（そろわない）', () => {
    const values = new Set([0.1, 0.3, 0.6, 0.9].map((r) => nextPollDelay(15000, () => r)));
    expect(values.size).toBe(4);
  });

  it('どれだけ短くしても1秒より詰まらない（連打にしない）', () => {
    expect(nextPollDelay(500, () => 0)).toBeGreaterThanOrEqual(1000);
  });
});

describe('Realtimeで一斉に届いたときのずらし', () => {
  it('0から指定した幅の中に散る', () => {
    expect(realtimeJitter(1500, () => 0)).toBe(0);
    expect(realtimeJitter(1500, () => 1)).toBe(1500);
    expect(realtimeJitter(1500, () => 0.5)).toBe(750);
  });

  it('負の待ち時間にならない', () => {
    expect(realtimeJitter(1500, () => -1)).toBe(0);
  });

  it('101台ぶんを散らすと、1秒あたりの山が十分低くなる', () => {
    // 疑似乱数で101台を再現し、同じ100ms内に集中していないことを見る
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const buckets = new Map<number, number>();
    for (let i = 0; i < 101; i += 1) {
      const b = Math.floor(realtimeJitter(1500, rnd) / 100);
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
    const worst = Math.max(...buckets.values());
    // 何もしなければ 101 件が同じ瞬間に来る。散らせば1/5以下になる
    expect(worst).toBeLessThan(20);
  });
});
