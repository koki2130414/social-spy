/**
 * 参加者ログイン用のIDとパスワードを組み立てる純粋関数。
 *
 * 当日は受付でIDとパスワードを口頭・紙で渡すことを想定しているため、
 * 「読み上げても間違えない」ことを最優先にしている。
 *  - 紛らわしい文字（0/O、1/l/I）を使わない
 *  - パスワードは記号を使わず、スマホで打ちやすい長さに抑える
 */

/** 読み間違えにくい英数字だけを使う */
const SAFE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SAFE_DIGITS = '23456789';

export const LOGIN_ID_MIN = 4;
export const LOGIN_ID_MAX = 24;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

/**
 * ログインIDの表記ゆれを吸収する。
 * 受付で伝えたIDを参加者が大文字で入力しても通るようにするため、
 * 保存時・照合時の両方でこの関数を通す。
 */
export function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

/** 入力として受け付けられるIDか（英数字とハイフン・アンダースコアのみ） */
export function isValidLoginId(value: string): boolean {
  const id = normalizeLoginId(value);
  if (id.length < LOGIN_ID_MIN || id.length > LOGIN_ID_MAX) return false;
  return /^[a-z0-9_-]+$/.test(id);
}

/**
 * ランダムなログインIDを作る（例: agent-7k4p）。
 * random は 0以上1未満を返す関数。テストから差し替えられるように引数で受ける。
 */
export function generateLoginId(random: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += SAFE_ALPHABET[Math.floor(random() * SAFE_ALPHABET.length)];
  }
  return `agent-${suffix}`;
}

/**
 * ランダムなパスワードを作る（例: kmpq-4837）。
 * 口頭で伝えられる長さにしつつ、英字4 + 数字4 で総当たりに耐える程度は確保する。
 */
export function generatePassword(random: () => number = Math.random): string {
  let letters = '';
  for (let i = 0; i < 4; i += 1) {
    letters += SAFE_ALPHABET[Math.floor(random() * SAFE_ALPHABET.length)];
  }
  let digits = '';
  for (let i = 0; i < 4; i += 1) {
    digits += SAFE_DIGITS[Math.floor(random() * SAFE_DIGITS.length)];
  }
  return `${letters}-${digits}`;
}
