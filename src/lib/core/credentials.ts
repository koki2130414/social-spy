/**
 * 参加者ログイン用のIDとパスワードを組み立てる純粋関数。
 *
 * 当日は受付でIDとパスワードを口頭・紙で渡すことを想定しているため、
 * 「読み上げても間違えない」ことを最優先にしている。
 *  - 紛らわしい文字（0/O、1/l/I）を使わない
 *  - パスワードは記号を使わず、スマホで打ちやすい長さに抑える
 */

/** 読み間違えにくい英数字だけを使う（自動発行のIDに使う） */
const SAFE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * パスワードは数字だけにする。
 *
 * 受付では番号とパスワードを打ってもらうが、英字が混じると
 * スマホでキーボードを切り替える必要があり、そこで手が止まる。
 * 数字だけなら端末がテンキーを出すので速い。
 *
 * 数字だけなら 0 と O、1 と l の取り違えも起きないため、
 * 紛らわしい文字を除く必要がなく 0〜9 をすべて使える。
 */
const PASSWORD_DIGITS = '0123456789';

/** パスワードの桁数。短いぶんは試行回数の制限で守る（server/auth/login-throttle） */
export const PASSWORD_LENGTH = 4;

/**
 * 1文字から許す。受付で「あなたは42番」と番号を渡し、
 * その番号をそのままIDにして入場する運用のため。
 *
 * IDが短くて推測しやすくても、入場にはパスワードが要る。
 * パスワードは数字4桁（1万通り）と短いため、総当たりを防ぐのは
 * 桁数ではなく試行回数の制限側の役目になっている。
 */
export const LOGIN_ID_MIN = 1;
export const LOGIN_ID_MAX = 24;
export const PASSWORD_MIN = 4;
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
 * ランダムなパスワードを作る（例: 4827）。
 *
 * 数字4桁なので 0000 から 9999 の1万通り。
 * 桁数だけでは総当たりを防げないため、間違いが続いたときに
 * 一時的にログインを止める仕組みと必ずセットで使うこと。
 *
 * 先頭が 0 の場合もそのまま残す（文字列として扱う）。
 */
export function generatePassword(random: () => number = Math.random): string {
  let password = '';
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
    password += PASSWORD_DIGITS[Math.floor(random() * PASSWORD_DIGITS.length)];
  }
  return password;
}
