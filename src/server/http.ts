import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { ServiceError, toErrorResponse } from './errors';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
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
