import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { sessionSecret } from '@/lib/env';

export const PARTICIPANT_COOKIE = 'spy_participant';
export const ADMIN_COOKIE = 'spy_admin';
export const DEMO_PERSONA_COOKIE = 'spy_demo_persona';

const MAX_AGE_SECONDS = 60 * 60 * 12; // 12時間

export interface ParticipantSession {
  pid: string;
  eid: string;
  iat: number;
}

export interface AdminSession {
  uid: string;
  email: string;
  name: string;
  demo: boolean;
  iat: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function createToken(data: object): string {
  const payload = b64url(JSON.stringify(data));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T & {
      iat?: number;
    };
    if (typeof parsed.iat === 'number' && Date.now() - parsed.iat > MAX_AGE_SECONDS * 1000) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};

export async function setParticipantSession(pid: string, eid: string): Promise<void> {
  const store = await cookies();
  store.set(PARTICIPANT_COOKIE, createToken({ pid, eid, iat: Date.now() }), cookieOptions);
}

export async function getParticipantSession(): Promise<ParticipantSession | null> {
  const store = await cookies();
  const payload = verifyToken<ParticipantSession & { typ?: string }>(
    store.get(PARTICIPANT_COOKIE)?.value,
  );
  // 参加用リンクのトークンをそのままセッションCookieとして使わせない（種類の取り違え防止）
  if (!payload || payload.typ) return null;
  return payload;
}

export async function clearParticipantSession(): Promise<void> {
  const store = await cookies();
  store.delete(PARTICIPANT_COOKIE);
}

export async function setAdminSession(session: Omit<AdminSession, 'iat'>): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createToken({ ...session, iat: Date.now() }), cookieOptions);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifyToken<AdminSession>(store.get(ADMIN_COOKIE)?.value);
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/* -------------------------------------------------------------------------
 * 参加用リンク
 *
 * 運営が参加者を代理登録したときに配る、その人専用のURLに埋め込むトークン。
 * リンクを開くと参加者セッションが発行され、自分の画面に入れる。
 *
 * 有効期限は持たせない。イベント当日までに配れるようにするためで、
 * 扱いはイベントのQRコードと同じ（渡した相手だけが使う前提）。
 * 無効化したいときは、その参加者を削除する。
 * ---------------------------------------------------------------------- */

const JOIN_TOKEN_TYPE = 'join';

export interface JoinTokenPayload {
  typ: typeof JOIN_TOKEN_TYPE;
  pid: string;
  eid: string;
}

export function createJoinToken(pid: string, eid: string): string {
  return createToken({ typ: JOIN_TOKEN_TYPE, pid, eid });
}

export function verifyJoinToken(token: string | undefined | null): JoinTokenPayload | null {
  const payload = verifyToken<JoinTokenPayload>(token);
  if (!payload || payload.typ !== JOIN_TOKEN_TYPE) return null;
  if (!payload.pid || !payload.eid) return null;
  return payload;
}

/* -------------------------------------------------------------------------
 * 運営者のパスワード設定リンク
 *
 * 新しい運営メンバーを追加したときに配る、その人専用のURLに埋め込むトークン。
 * リンクを開いた本人が自分でパスワードを決める。
 *
 * Supabaseの標準メールはプロジェクトのメンバー以外へ送信できないため、
 * メールに頼らず「運営がリンクをコピーして本人に渡す」形にしている。
 *
 * 参加用リンクと違い、こちらは管理画面に入れる権限そのものなので期限を付ける。
 * 期限切れ後は管理画面から招待し直せば新しいリンクが出る。
 * （古いリンクは期限内なら有効なままなので、渡す相手を間違えたときは
 *   運営メンバー画面で権限を外すこと）
 * ---------------------------------------------------------------------- */

const ADMIN_SETUP_TOKEN_TYPE = 'admin-setup';

/** 7日間。当日までに渡せて、かつ放置されたリンクが残り続けない長さ */
export const ADMIN_SETUP_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminSetupTokenPayload {
  typ: typeof ADMIN_SETUP_TOKEN_TYPE;
  uid: string;
  /** 有効期限（ミリ秒） */
  exp: number;
}

export function createAdminSetupToken(uid: string, now = Date.now()): string {
  return createToken({
    typ: ADMIN_SETUP_TOKEN_TYPE,
    uid,
    exp: now + ADMIN_SETUP_TOKEN_MAX_AGE_MS,
  });
}

export function verifyAdminSetupToken(
  token: string | undefined | null,
  now = Date.now(),
): AdminSetupTokenPayload | null {
  const payload = verifyToken<AdminSetupTokenPayload>(token);
  if (!payload || payload.typ !== ADMIN_SETUP_TOKEN_TYPE) return null;
  if (!payload.uid) return null;
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  return payload;
}
