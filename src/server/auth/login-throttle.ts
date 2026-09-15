/**
 * 参加者ログインの試行回数を制限する（純粋な判定部分）。
 *
 * 受付で渡すパスワードは数字4桁＝1万通りしかない。
 * 打ちやすさを優先したぶん、総当たりはここで止める。
 *
 * 数え方と閾値をこのファイルに集めてあるので、
 * データベースの読み書きを伴わずにテストできる。
 */

/** 何回間違えたら止めるか。紙を見ながら打つ人が引っかからない程度に余裕を持たせる */
export const MAX_FAILED_ATTEMPTS = 8;

/** 止める時間。長すぎると当日の受付が詰まるので短めにする */
export const LOCK_DURATION_MS = 5 * 60 * 1000;

export interface LoginAttemptState {
  failedCount: number;
  lockedUntil: string | null;
}

/** 今ログインを止めている最中か */
export function isLocked(state: LoginAttemptState, now: number = Date.now()): boolean {
  if (!state.lockedUntil) return false;
  return new Date(state.lockedUntil).getTime() > now;
}

/** あと何秒で解除されるか（画面の案内に使う）。止まっていなければ 0 */
export function lockRemainingSeconds(state: LoginAttemptState, now: number = Date.now()): number {
  if (!state.lockedUntil) return 0;
  const ms = new Date(state.lockedUntil).getTime() - now;
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/**
 * パスワードを間違えたあとの状態を決める。
 *
 * 上限に達したら止めたうえで回数を0に戻す。
 * 戻さないと、解除された直後の1回で再び止まってしまい、
 * 実質ずっと入れない人が出る。
 */
export function afterFailure(
  state: LoginAttemptState,
  now: number = Date.now(),
): LoginAttemptState {
  const failedCount = state.failedCount + 1;
  if (failedCount >= MAX_FAILED_ATTEMPTS) {
    return {
      failedCount: 0,
      lockedUntil: new Date(now + LOCK_DURATION_MS).toISOString(),
    };
  }
  return { failedCount, lockedUntil: state.lockedUntil };
}

/** ログインできたときの状態。数えていた回数も止めていた記録も消す */
export function afterSuccess(): LoginAttemptState {
  return { failedCount: 0, lockedUntil: null };
}

/** 止められている人へ出す案内。何分待てばよいか分かる形にする */
export function lockedMessage(remainingSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  return `パスワードの間違いが続いたため、${minutes}分ほどログインを止めています。お急ぎの場合は受付にお声がけください。`;
}
