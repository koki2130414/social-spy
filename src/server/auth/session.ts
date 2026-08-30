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
  return verifyToken<ParticipantSession>(store.get(PARTICIPANT_COOKIE)?.value);
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
