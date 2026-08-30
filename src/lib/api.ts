export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? 'UNKNOWN', err.message ?? '通信に失敗しました。', res.status);
  }
  return json as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handle<T>(res);
}

export async function apiSend<T>(
  url: string,
  body?: unknown,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return handle<T>(res);
}
