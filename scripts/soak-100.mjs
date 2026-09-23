/**
 * 90分の交流会を想定した「開きっぱなし」の耐久デモ。
 *
 * 当日は100台が同じ画面を開いたまま、15秒おきに状態を取りに来る。
 * 時間が経つほど遅くなる／メモリが増え続ける、といったことが無いかを見る。
 *
 *   node scripts/soak-100.mjs [ベースURL] [人数] [秒数]
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3210';
const N = Number(process.argv[3] || 100);
const SECONDS = Number(process.argv[4] || 180);
const ADMIN = { email: 'admin@socialspy.demo', password: 'spy-demo-2026' };

const jar = () => new Map();
const cookie = (j) => [...j.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(j, method, path, body, manual = false) {
  const t = performance.now();
  const headers = { cookie: cookie(j) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    redirect: manual ? 'manual' : 'follow',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) j.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML */
  }
  return { status: res.status, ms: performance.now() - t, json, text };
}

function stats(list) {
  if (!list.length) return { n: 0, p50: 0, p95: 0, max: 0 };
  const s = [...list].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
  return {
    n: s.length,
    p50: Math.round(at(50)),
    p95: Math.round(at(95)),
    max: Math.round(s.at(-1)),
  };
}

async function main() {
  const admin = jar();
  await req(admin, 'POST', '/api/admin/login', ADMIN);
  const code = 'SK' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const ev = await req(admin, 'POST', '/api/admin/events', {
    name: `耐久デモ ${code}`,
    code,
    startsAt: new Date().toISOString(),
    durationMinutes: 90,
    spyRevealOffsetMinutes: 45,
    spyCount: 5,
    registrationOpen: true,
  });
  const eventId = ev.json.event?.id ?? ev.json.id;

  const phones = [];
  for (let i = 0; i < N; i++) {
    const r = await req(admin, 'POST', `/api/admin/events/${eventId}/participants`, {
      displayName: `耐久${String(i + 1).padStart(3, '0')}`,
      loginId: String(i + 1),
    });
    if (r.status === 201) phones.push({ ...r.json, jar: jar() });
  }
  await Promise.all(
    phones.map((p) => req(p.jar, 'GET', new URL(p.joinUrl).pathname, undefined, true)),
  );
  await req(admin, 'POST', `/api/admin/events/${eventId}/spies`, { mode: 'auto' });
  await req(admin, 'POST', `/api/admin/events/${eventId}/phase`, { to: 'ACTIVE' });
  console.log(`${phones.length}台が参加。${SECONDS}秒ぶん、開きっぱなしにする\n`);

  const buckets = new Map(); // 30秒ごと
  let errors = 0;
  let running = true;
  const bucketOf = (t) => Math.floor((t - start) / 30000);
  const start = Date.now();

  const record = (ms, status) => {
    const b = bucketOf(Date.now());
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(ms);
    if (status !== 200) errors++;
  };

  const workers = phones.map(async (p, i) => {
    await sleep((i / phones.length) * 15000); // 端末ごとに開始をずらす
    while (running) {
      const r = await req(p.jar, 'GET', '/api/participant/state');
      record(r.ms, r.status);
      await sleep(15000 * (0.8 + Math.random() * 0.4));
    }
  });

  // 運営はダッシュボードを開いたまま
  const adminMs = [];
  const adminWorker = (async () => {
    while (running) {
      const r = await req(admin, 'GET', `/api/admin/events/${eventId}/dashboard`);
      adminMs.push(r.ms);
      await sleep(5000);
    }
  })();

  await sleep(SECONDS * 1000);
  running = false;
  await Promise.all([...workers, adminWorker]);

  console.log('30秒ごとの状態取得（ms）');
  console.table(
    [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, list]) => ({ 経過: `${b * 30}〜${b * 30 + 30}秒`, ...stats(list) })),
  );
  console.log('運営ダッシュボード', stats(adminMs));
  console.log(`エラー ${errors} 件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
