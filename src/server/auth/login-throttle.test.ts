import { describe, expect, it } from 'vitest';
import {
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  afterFailure,
  afterSuccess,
  isLocked,
  lockRemainingSeconds,
  lockedMessage,
} from './login-throttle';

/**
 * 受付で渡すパスワードを数字4桁にしたので、1万通りしかない。
 * 総当たりを止めるのは桁数ではなくここの役目になっている。
 */

const T0 = new Date('2026-09-25T10:00:00.000Z').getTime();

function fail(times: number, from = { failedCount: 0, lockedUntil: null as string | null }) {
  let state = from;
  for (let i = 0; i < times; i += 1) state = afterFailure(state, T0);
  return state;
}

describe('ログインの試行回数制限', () => {
  it('数回の間違いでは止めない（紙を見ながら打つ人を弾かない）', () => {
    const state = fail(MAX_FAILED_ATTEMPTS - 1);
    expect(isLocked(state, T0)).toBe(false);
    expect(state.failedCount).toBe(MAX_FAILED_ATTEMPTS - 1);
  });

  it('上限まで間違えると止まる', () => {
    const state = fail(MAX_FAILED_ATTEMPTS);
    expect(isLocked(state, T0)).toBe(true);
  });

  it('時間が経てば自然に解除される', () => {
    const state = fail(MAX_FAILED_ATTEMPTS);
    expect(isLocked(state, T0 + LOCK_DURATION_MS - 1000)).toBe(true);
    expect(isLocked(state, T0 + LOCK_DURATION_MS + 1000)).toBe(false);
  });

  it('解除された直後の1回でまた止まったりしない', () => {
    // 回数を0に戻していないと、解除された瞬間の1回で再び上限に達し、
    // その人は実質ずっと入れなくなる
    const locked = fail(MAX_FAILED_ATTEMPTS);
    const afterUnlock = afterFailure(locked, T0 + LOCK_DURATION_MS + 1000);
    expect(isLocked(afterUnlock, T0 + LOCK_DURATION_MS + 1000)).toBe(false);
  });

  it('入れたら数えていた回数も止めていた記録も消える', () => {
    expect(afterSuccess()).toEqual({ failedCount: 0, lockedUntil: null });
  });

  it('総当たりに現実的でない時間がかかる', () => {
    // 数字4桁 = 1万通り。上限まで試すと止まるので、
    // 1回の解除あたり MAX_FAILED_ATTEMPTS 回しか試せない。
    const triesPerWindow = MAX_FAILED_ATTEMPTS;
    const windowsNeeded = 10000 / triesPerWindow;
    const hours = (windowsNeeded * LOCK_DURATION_MS) / 3_600_000;
    // 交流会は60分。丸1日以上かかるなら当日中には破れない
    expect(hours).toBeGreaterThan(24);
  });

  it('あと何分待てばよいか案内できる', () => {
    const state = fail(MAX_FAILED_ATTEMPTS);
    const remaining = lockRemainingSeconds(state, T0);
    expect(remaining).toBe(LOCK_DURATION_MS / 1000);
    expect(lockedMessage(remaining)).toContain('分');
  });

  it('止めていないときは残り時間0', () => {
    expect(lockRemainingSeconds({ failedCount: 3, lockedUntil: null }, T0)).toBe(0);
  });
});
