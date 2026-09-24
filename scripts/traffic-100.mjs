/**
 * 当日、会場の回線に何バイト流れるかの実測。
 *
 * 100台が画面を開いたまま一定時間ゲームを待つ、という状態を作って
 * 「問い合わせの回数」と「流れたバイト数」を数える。
 *
 * 2つのやり方を同じ条件で比べる。
 *   naive … 15秒固定・毎回まるごと受け取る（改善前の動き）
 *   light … 変化が無ければ本文を受け取らず、間隔も広げる（今の動き）
 *
 *   node scripts/traffic-100.mjs [ベースURL] [人数] [秒数]
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3210';
const N = Number(process.argv[3] || 100);
const SECONDS = Number(process.argv[4] || 120);
const ADMIN = { email: 'admin@socialspy.demo', password: 'spy-demo-2026' };

/** HTTPの往復そのものにかかる量の目安（ヘッダ・Cookie・TLSの記録など） */
const OVERHEAD_BYTES = 700;

const jar = () => new Map();
const cookie = (j) => [...j.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(j, method, path, body, extraHeaders, manual = false) {
  const headers = { cookie: cookie(j), ...(extraHeaders ?? {}) };
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
    /* HTML や空 */
  }
  return {
    status: res.status,
    json,
    bytes: Buffer.byteLength(text),
    etag: res.headers.get('etag'),
  };
}

/** 参加者画面と同じ間隔の広げ方 */
function relaxed(current, changed, base, max) {
  if (changed) return base;
  return Math.min(max, Math.round(current * 1.5));
}
const jitter = (ms) => Math.max(1000, Math.round(ms * (0.8 + Math.random() * 0.4)));

async function setup() {
  const admin = jar();
  await req(admin, 'POST', '/api/admin/login', ADMIN);
  const code = 'TR' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const ev = await req(admin, 'POST', '/api/admin/events', {
    name: `通信量の実測 ${code}`,
    code,
    startsAt: new Date().toISOString(),
    durationMinutes: 90,
    spyRevealOffsetMinutes: 45,
    spyCount: 5,
    spyMissionPublic: true,
    registrationOpen: true,
  });
  const eventId = ev.json.event?.id ?? ev.json.id;

  const phones = [];
  for (let i = 0; i < N; i++) {
    const r = await req(admin, 'POST', `/api/admin/events/${eventId}/participants`, {
      displayName: `計測${String(i + 1).padStart(3, '0')}`,
      loginId: String(i + 1),
    });
    if (r.status === 201) phones.push({ ...r.json, jar: jar() });
  }
  await Promise.all(
    phones.map((p) => req(p.jar, 'GET', new URL(p.joinUrl).pathname, undefined, undefined, true)),
  );
  await req(admin, 'POST', `/api/admin/events/${eventId}/spies`, { mode: 'auto' });
  await req(admin, 'POST', `/api/admin/events/${eventId}/phase`, { to: 'ACTIVE' });
  return { admin, eventId, phones };
}

async function measure(mode, phones, seconds) {
  let running = true;
  let requests = 0;
  let body = 0;
  let notModified = 0;
  let errors = 0;

  const workers = phones.map(async (p, i) => {
    await sleep((i / phones.length) * 15000); // 端末ごとに開始をずらす
    let etag = null;
    let interval = 15000;
    while (running) {
      const headers = mode === 'light' && etag ? { 'if-none-match': etag } : undefined;
      const r = await req(p.jar, 'GET', '/api/participant/state', undefined, headers);
      requests++;
      body += r.bytes;
      if (r.status === 304) notModified++;
      else if (r.status !== 200) errors++;
      if (r.etag) etag = r.etag;

      interval = mode === 'light' ? relaxed(interval, r.status !== 304, 15000, 30000) : 15000;
      await sleep(jitter(interval));
    }
  });

  await sleep(seconds * 1000);
  running = false;
  await Promise.all(workers);

  const total = body + requests * OVERHEAD_BYTES;
  return { mode, requests, notModified, errors, body, total };
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + 'MB';
}

async function main() {
  console.log(`\n${N}台が画面を開いたまま ${SECONDS}秒。2つのやり方を比べる\n`);
  const { phones } = await setup();
  console.log(`${phones.length}台 参加\n`);

  const naive = await measure('naive', phones, SECONDS);
  const light = await measure('light', phones, SECONDS);

  const rows = [naive, light].map((r) => ({
    やり方:
      r.mode === 'naive' ? '改善前（15秒固定・毎回まるごと）' : '今（変化が無ければ本文なし）',
    問い合わせ: r.requests,
    '本文なし(304)': r.notModified,
    '本文(合計)': mb(r.body),
    往復こみ合計: mb(r.total),
    エラー: r.errors,
  }));
  console.table(rows);

  const saved = 1 - light.total / naive.total;
  const savedBody = 1 - light.body / naive.body;
  console.log(`本文だけで ${(savedBody * 100).toFixed(0)}% 削減`);
  console.log(`往復のぶんも入れて ${(saved * 100).toFixed(0)}% 削減`);

  // 90分の交流会に引き伸ばした目安
  const scale = (90 * 60) / SECONDS;
  console.log(`\n90分ぶんの目安（${N}台）`);
  console.log(`  改善前: ${mb(naive.total * scale)}`);
  console.log(`  今    : ${mb(light.total * scale)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
