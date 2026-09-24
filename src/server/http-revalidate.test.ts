import { describe, expect, it } from 'vitest';
import { okRevalidate } from '@/server/http';

/**
 * 変化が無いときに本文を送らない仕組み。
 *
 * 当日は118台が15〜30秒おきに状態を取りに来る。ゲームは大半の時間
 * 何も変わらないので、同じ内容を何度も送ることになる。
 * ここが効かなくなると、会場の回線に無駄な通信が戻ってくる。
 *
 * 守りたいのは次の3つ。
 *  ・同じ内容なら本文を送らないこと
 *  ・違う内容なら必ず送ること（変化を取りこぼさない）
 *  ・端末に保存させないこと（役割やSPY情報を残さない）
 */

function req(ifNoneMatch?: string): Request {
  return new Request('https://example.test/api/participant/state', {
    headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : undefined,
  });
}

describe('変化が無いときは本文を送らない', () => {
  it('初回は本文を返し、指紋を付ける', async () => {
    const res = okRevalidate(req(), { phase: 'ACTIVE', n: 1 });

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeTruthy();
    expect(await res.json()).toEqual({ phase: 'ACTIVE', n: 1 });
  });

  it('同じ指紋で聞き直すと、本文は空になる', async () => {
    const data = { phase: 'ACTIVE', n: 1 };
    const etag = okRevalidate(req(), data).headers.get('etag')!;

    const again = okRevalidate(req(etag), data);

    expect(again.status).toBe(304);
    expect(again.headers.get('etag')).toBe(etag);
    expect(await again.text()).toBe('');
  });

  it('中身が変われば、必ず本文を返す', async () => {
    const etag = okRevalidate(req(), { phase: 'ACTIVE', n: 1 }).headers.get('etag')!;

    const next = okRevalidate(req(etag), { phase: 'VOTING', n: 1 });

    expect(next.status).toBe(200);
    expect(await next.json()).toEqual({ phase: 'VOTING', n: 1 });
    expect(next.headers.get('etag')).not.toBe(etag);
  });

  it('1文字の違いでも別の指紋になる', () => {
    const a = okRevalidate(req(), { name: 'まいと' }).headers.get('etag');
    const b = okRevalidate(req(), { name: 'まいど' }).headers.get('etag');
    expect(a).not.toBe(b);
  });

  it('端末に保存させない', async () => {
    const data = { role: 'SPY' };
    const first = okRevalidate(req(), data);
    const etag = first.headers.get('etag')!;

    // 役割やSPY情報が端末のキャッシュに残らないこと
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(okRevalidate(req(etag), data).headers.get('cache-control')).toBe('no-store');
  });
});
