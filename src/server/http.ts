import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { ServiceError, toErrorResponse } from './errors';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * 中身が前回と同じなら、本文を送らずに「変わっていない」とだけ返す。
 *
 * 当日は118台が15〜30秒おきに状態を取りに来る。ゲームは大半の時間
 * 何も変わらないので、同じ内容を何度も送ることになる。
 * 指紋（ETag）を付けて、前回と同じなら 304 だけを返す。
 * 本文がまるごと無くなるので、会場の回線に流れる量が大きく減る。
 *
 * 端末には保存させない（Cache-Control: no-store）。
 * 役割やSPY情報が端末に残らないようにするためで、
 * 前回の値はアプリのメモリ上だけで持つ。
 */
export function okRevalidate<T>(request: Request, data: T) {
  const body = JSON.stringify(data);
  const etag = `W/"${fingerprint(body)}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'no-store' },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ETag: etag,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * 文字列の指紋。
 *
 * 中身が変わったかどうかが分かればよいので、短くて速いもので足りる
 * （暗号用の強度は要らない）。FNV-1a を2本流して衝突を実用上無視できる長さにする。
 */
function fingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const a = (h1 >>> 0).toString(36);
  const b = (h2 >>> 0).toString(36);
  return `${a}${b}${text.length.toString(36)}`;
}

export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors[0]?.message ?? '入力内容を確認してください。',
        },
      },
      { status: 422 },
    );
  }
  const { status, body } = toErrorResponse(error);
  return NextResponse.json(body, { status });
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ServiceError('INVALID_JSON', 'リクエストの形式が正しくありません。', 400);
  }
  return schema.parse(json);
}

/** すべてのAPIを動的レンダリングにするための共通設定 */
export const dynamic = 'force-dynamic';
