import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * 参加者パスワードのハッシュ化。
 *
 * 平文は保存しない。管理者が発行した直後に一度だけ画面へ出し、
 * データベースにはこの関数が作るハッシュだけを置く。
 * 依存を増やさないため Node 標準の scrypt を使う。
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, saltPart, keyPart] = stored.split('$');
  if (prefix !== PREFIX || !saltPart || !keyPart) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyPart, 'base64url');
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scrypt(password, Buffer.from(saltPart, 'base64url'), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}
