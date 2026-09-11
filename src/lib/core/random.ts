/** テスト可能な決定的乱数（xorshift32）。seed を渡すと再現可能になる */
export type Rng = () => number;

export function createRng(seed = 1): Rng {
  let x = seed >>> 0 || 1;
  const next = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0xffffffff;
  };
  // 小さい種だと最初の数回が極端に小さい値になり、
  // shuffle の1回目が必ず同じ動きをしてしまう（特定の要素が先頭に来ない）。
  // 種の影響が散るまで空回しする。
  for (let i = 0; i < 8; i++) next();
  return next;
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
