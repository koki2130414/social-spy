/**
 * テスト用の next/headers モック。
 * Cookie を単純な Map で保持し、サーバーサービス層をそのまま検証できるようにする。
 */
interface CookieRecord {
  name: string;
  value: string;
}

const jar = new Map<string, string>();

export const cookieJar = {
  clear() {
    jar.clear();
  },
  has(name: string) {
    return jar.has(name);
  },
  raw: jar,
};

const store = {
  get(name: string): CookieRecord | undefined {
    const value = jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string) {
    jar.set(name, value);
  },
  delete(name: string) {
    jar.delete(name);
  },
};

export async function cookies() {
  return store;
}

export async function headers() {
  return new Headers();
}
