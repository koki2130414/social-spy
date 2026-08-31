import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(`https://example.com${path}`));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

/** リダイレクト先のパス。素通しなら null */
function redirectedTo(path: string, cookies?: Record<string, string>): string | null {
  const res = middleware(request(path, cookies));
  const location = res.headers.get('location');
  return location ? new URL(location).pathname : null;
}

describe('未ログインでも開ける管理画面', () => {
  it('招待メールのパスワード設定画面はログインなしで開ける', () => {
    // ここを塞ぐと、招待された本人がリンクを開いても永久に設定できなくなる
    expect(redirectedTo('/admin/set-password')).toBeNull();
  });

  it('ログイン画面はログインなしで開ける', () => {
    expect(redirectedTo('/admin/login')).toBeNull();
  });
});

describe('管理画面の一次ゲート', () => {
  it('未ログインで管理画面を開くとログインへ送られる', () => {
    expect(redirectedTo('/admin')).toBe('/admin/login');
    expect(redirectedTo('/admin/members')).toBe('/admin/login');
    expect(redirectedTo('/admin/participants')).toBe('/admin/login');
  });

  it('Cookieがあれば通す（署名の検証はサーバー側で行う）', () => {
    expect(redirectedTo('/admin/members', { spy_admin: 'dummy' })).toBeNull();
  });

  it('set-password に似た別のパスは素通ししない', () => {
    expect(redirectedTo('/admin/set-password-x')).toBe('/admin/login');
    expect(redirectedTo('/admin/set-password/extra')).toBe('/admin/login');
  });
});

describe('参加者画面の一次ゲート', () => {
  it('未参加で /game を開くと参加画面へ送られる', () => {
    expect(redirectedTo('/game')).toBe('/join');
    expect(redirectedTo('/game/missions')).toBe('/join');
  });

  it('参加者Cookieがあれば通す', () => {
    expect(redirectedTo('/game', { spy_participant: 'dummy' })).toBeNull();
  });
});
