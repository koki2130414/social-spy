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

/**
 * 前回と同じ内容なら本文を受け取らずに済ませる取得。
 *
 * 当日、参加者の画面は15〜30秒おきに同じことを聞きに行く。
 * ゲームは大半の時間なにも変わらないので、前回の指紋を添えて聞き、
 * 変わっていなければサーバーは本文を返さない（304）。
 * 会場の回線に流れる量がその分だけ減る。
 *
 * 前回の値はこのモジュールのメモリ上にだけ置く。
 * 端末（localStorage や Cache Storage）には保存しない
 * ＝アプリを閉じれば消える。役割やSPY情報を端末に残さないため。
 */
interface Revalidated<T> {
  data: T;
  /** 前回から中身が変わったか。変わっていなければ問い合わせ間隔を広げてよい */
  changed: boolean;
}

const lastSeen = new Map<string, { etag: string; data: unknown }>();

export function forgetCached(url?: string): void {
  if (url) lastSeen.delete(url);
  else lastSeen.clear();
}

export async function apiGetRevalidate<T>(url: string): Promise<Revalidated<T>> {
  const previous = lastSeen.get(url);
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: previous ? { 'If-None-Match': previous.etag } : undefined,
  });

  if (res.status === 304 && previous) {
    return { data: previous.data as T, changed: false };
  }

  const data = await handle<T>(res);
  const etag = res.headers.get('etag');
  if (etag) lastSeen.set(url, { etag, data });
  else lastSeen.delete(url);

  // 指紋が同じでも本文が返ってきた場合（経路上で外されたなど）に備えて、
  // 中身そのものを見て「変わったか」を判断する
  const changed = !previous || JSON.stringify(previous.data) !== JSON.stringify(data);
  return { data, changed };
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
