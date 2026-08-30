import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64Url, urlBase64ToUint8Array } from './push-client';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('Web Push の鍵変換', () => {
  it('VAPID公開鍵（65バイト）を復元できる', () => {
    const original = new Uint8Array(65);
    for (let i = 0; i < original.length; i += 1) original[i] = (i * 7 + 13) % 256;

    const decoded = urlBase64ToUint8Array(toBase64Url(original));

    expect(decoded.length).toBe(65);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('パディングが無い base64url も扱える', () => {
    for (const len of [1, 2, 3, 4, 5, 16, 32, 65]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 31) % 256);
      const encoded = toBase64Url(bytes);
      expect(encoded).not.toContain('=');
      expect(Array.from(urlBase64ToUint8Array(encoded))).toEqual(Array.from(bytes));
    }
  });

  it('URLセーフな文字（- と _）を正しく戻す', () => {
    const bytes = new Uint8Array([251, 255, 190, 239, 255]);
    const encoded = toBase64Url(bytes);
    expect(encoded).toMatch(/[-_]/);
    expect(Array.from(urlBase64ToUint8Array(encoded))).toEqual(Array.from(bytes));
  });

  it('ArrayBuffer を base64url へ戻せる（購読鍵の送信に使う）', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const encoded = arrayBufferToBase64Url(bytes.buffer as ArrayBuffer);
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(Array.from(urlBase64ToUint8Array(encoded))).toEqual(Array.from(bytes));
  });

  it('subscribe に渡せる ArrayBuffer 上に確保される', () => {
    const decoded = urlBase64ToUint8Array(toBase64Url(new Uint8Array([1, 2, 3])));
    expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
