/**
 * 問い合わせのタイミングをずらすための計算。
 *
 * 会場では101台が同じ瞬間に画面を開き、フェーズが変わると
 * Realtime が全員に同時に届く。そのまま全員が同時に問い合わせると、
 * 平らに均せば余裕のある処理量でも、その一瞬だけ詰まって「重い」になる。
 *
 * やっていることは単純で、全員の時計を少しずつずらすだけ。
 * 画面の見た目は変わらないが、山が平らになる。
 */

/** 定期更新の間隔を ±20% ずらす。全端末の周期がそろってしまうのを防ぐ */
export function nextPollDelay(baseMs: number, random: () => number = Math.random): number {
  const spread = 0.2;
  const delay = baseMs * (1 - spread + random() * spread * 2);
  // 極端に短い間隔にはしない（連打と同じになるため）
  return Math.max(1000, Math.round(delay));
}

/**
 * 何も変わらない間は、問い合わせの間隔を少しずつ広げる。
 *
 * ゲームの大半の時間はフェーズもお知らせも動かない。
 * それでも15秒おきに118台が聞きに行くと、中身が空でも
 * 通信の往復そのものが会場の回線を埋める。
 *
 * 変化が無いあいだは1.5倍ずつ広げ、上限で止める。
 * フェーズ変更やお知らせが来たら base に戻すので、
 * 「変わったのに気づくのが遅れる」のは上限の1回ぶんに収まる。
 *
 * 上限を欲張らないのは、Realtime が届かなかったときに
 * この間隔がそのまま遅れになるため。
 */
export function relaxedInterval(
  currentMs: number,
  changed: boolean,
  baseMs: number,
  maxMs: number,
): number {
  if (changed) return baseMs;
  return Math.min(maxMs, Math.round(currentMs * 1.5));
}

/**
 * Realtime で一斉に届いた合図に対する待ち時間。
 *
 * 0〜maxMs の範囲に散らす。1.5秒ほど散らせば、101台の問い合わせが
 * 1秒あたり数件に均される。人が見て遅いと感じる長さではない。
 */
export function realtimeJitter(maxMs: number, random: () => number = Math.random): number {
  return Math.max(0, Math.round(random() * maxMs));
}
