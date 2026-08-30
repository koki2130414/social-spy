export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function toErrorResponse(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (error instanceof ServiceError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message } } };
}
