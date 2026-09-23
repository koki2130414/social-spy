/**
 * 当日を想定した100人同時アクセスのデモ。
 *
 * 目的は「100台のスマホが同じ瞬間に同じことをしたとき、
 * エラーが出るか・どれだけ待たされるか・見えてはいけないものが見えるか」を実際に確かめること。
 *
 * 使い方:  node scripts/sim-100.mjs [ベースURL] [人数]
 *
 * 会場で本当に起きること（受付の一斉ログイン、ゲーム開始の一斉更新、
 * 投票の一斉送信、結果発表の一斉表示）をそのままの順番で再現する。
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3210';
const N = Number(process.argv[3] || 100);

const ADMIN = { email: 'admin@socialspy.demo', password: 'spy-demo-2026' };

// ---------------------------------------------------------------------------
// 1台のスマホ＝1つのcookie入れ。ブラウザ1つでは100人分を再現できないので自前で持つ
// ---------------------------------------------------------------------------
function newJar() {
  return new Map();
}

function applyCookies(jar, res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const samples = [];

let expectingFailure = false;

async function req(jar, method, path, body, opts = {}) {
  const started = performance.now();
  const headers = { cookie: cookieHeader(jar) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res, text;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      redirect: opts.manualRedirect ? 'manual' : 'follow',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await res.text();
  } catch (e) {
    samples.push({
      path: label(path),
      method,
      ms: performance.now() - started,
      status: 0,
      bytes: 0,
      expected: expectingFailure,
    });
    return { status: 0, ms: performance.now() - started, json: null, error: String(e), bytes: 0 };
  }
  const ms = performance.now() - started;
  applyCookies(jar, res);
  const bytes = Buffer.byteLength(text);
  samples.push({
    path: label(path),
    method,
    ms,
    status: res.status,
    bytes,
    expected: expectingFailure,
  });
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTMLなど */
  }
  return { status: res.status, ms, json, bytes, text, location: res.headers.get('location') };
}

/** 集計用に、IDの部分を潰した道筋の名前にする */
function label(path) {
  if (path.startsWith('/j/')) return '/j/:token';
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]+/gi, '/:id')
    .replace(/\/ev-[a-z0-9-]+/gi, '/:id')
    .replace(/\/pt-[a-z0-9-]+/gi, '/:id')
    .split('?')[0];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 同時に走らせる本数を絞りながら全部走らせる */
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const my = i++;
        out[my] = await fn(items[my], my);
      }
    }),
  );
  return out;
}

function stats(list) {
  if (!list || list.length === 0) return { n: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = [...list].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
  return {
    n: s.length,
    p50: Math.round(at(50)),
    p95: Math.round(at(95)),
    p99: Math.round(at(99)),
    max: Math.round(s[s.length - 1]),
  };
}

const problems = [];
function problem(severity, what) {
  problems.push({ severity, what });
  console.log(`  [${severity}] ${what}`);
}

// ---------------------------------------------------------------------------
// 見えてはいけないものが見えていないか、毎回の応答で確かめる
// ---------------------------------------------------------------------------
const leakSeen = new Set();
function checkLeak(who, state) {
  if (!state) return;
  const text = JSON.stringify(state);
  const phase = state.event?.phase;

  // 他人のroleは、参加者向けの応答に一切含めない決まり
  if (/"role"\s*:\s*"SPY"/.test(text) && state.me?.role !== 'SPY') {
    if (!leakSeen.has('role')) {
      leakSeen.add('role');
      problem('重大', `${who}: 自分以外のroleがSPYとして応答に含まれている`);
    }
  }
  // SPY MISSIONは、公開前はSPY本人以外に出さない
  const hasSpyMission = (state.missions ?? []).some((m) => m.kind === 'SPY');
  const revealed =
    phase === 'SPY_MISSION_REVEALED' ||
    phase === 'IDENTITY_REVEALED' ||
    phase === 'VOTING' ||
    phase === 'FINISHED';
  if (hasSpyMission && state.me?.role !== 'SPY' && !revealed) {
    if (!leakSeen.has('mission')) {
      leakSeen.add('mission');
      problem('重大', `${who}: 公開前なのにSPY MISSIONが一般参加者へ出ている（phase=${phase}）`);
    }
  }
}

// ---------------------------------------------------------------------------
// 本編
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== ${N}人同時アクセスのデモ  ${BASE} ===\n`);

  // --- 運営のログインとイベント作成 -----------------------------------------
  const admin = newJar();
  const login = await req(admin, 'POST', '/api/admin/login', ADMIN);
  if (login.status !== 200) throw new Error(`運営ログイン失敗: ${login.status} ${login.text}`);

  const code = 'LT' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const created = await req(admin, 'POST', '/api/admin/events', {
    name: `負荷デモ ${code}`,
    code,
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
    durationMinutes: 90,
    spyRevealOffsetMinutes: 45,
    spyCount: 5,
    registrationOpen: true,
  });
  if (created.status !== 201)
    throw new Error(`イベント作成失敗: ${created.status} ${created.text}`);
  const eventId = created.json.event?.id ?? created.json.id;
  console.log(`イベント: ${code} (${eventId})`);

  // --- 受付での事前登録（運営が100人ぶん登録する） --------------------------
  console.log(`\n[1] 参加者${N}人を登録`);
  let t0 = performance.now();
  const people = await pool(
    Array.from({ length: N }, (_, i) => i),
    8,
    async (i) => {
      const r = await req(admin, 'POST', `/api/admin/events/${eventId}/participants`, {
        displayName: `参加者${String(i + 1).padStart(3, '0')}`,
        loginId: String(i + 1),
      });
      if (r.status !== 201) {
        problem('重大', `登録失敗 ${i + 1}: ${r.status} ${r.text?.slice(0, 120)}`);
        return null;
      }
      return { ...r.json, jar: newJar(), index: i };
    },
  );
  const phones = people.filter(Boolean);
  console.log(`  ${phones.length}人 / ${Math.round(performance.now() - t0)}ms`);

  // --- 受付：100台が同じ瞬間にQRカードを読む（当日の本命の入り方） ----------
  console.log(`\n[2] 受付：${phones.length}台が同時にQRカードを読む`);
  t0 = performance.now();
  const qrMs = [];
  await Promise.all(
    phones.map(async (p) => {
      const path = new URL(p.joinUrl).pathname;
      const r = await req(p.jar, 'GET', path, undefined, { manualRedirect: true });
      qrMs.push(r.ms);
      // 署名が通れば /game へ送られる。/join?error= へ戻されたら失敗
      if (r.status < 300 || r.status >= 400)
        problem('重大', `QRで入れない ${p.displayName}: ${r.status}`);
      else if (/error=/.test(r.location ?? ''))
        problem('重大', `QRが弾かれた ${p.displayName}: ${r.location}`);
    }),
  );
  console.log(`  全員そろうまで ${Math.round(performance.now() - t0)}ms / 1台あたり`, stats(qrMs));

  // --- 予備：QRを無くした人のID＋パスワードでのログイン ----------------------
  console.log(`\n[2b] 予備：${phones.length}人がID＋パスワードでログイン（QRを忘れた場合）`);
  t0 = performance.now();
  const loginMs = [];
  await Promise.all(
    phones.map(async (p) => {
      const jar = newJar();
      const r = await req(jar, 'POST', '/api/participant/login', {
        code,
        loginId: p.loginId,
        password: p.password,
      });
      loginMs.push(r.ms);
      if (r.status !== 200)
        problem('重大', `ログイン失敗 ${p.displayName}: ${r.status} ${r.text?.slice(0, 120)}`);
    }),
  );
  console.log(
    `  全員そろうまで ${Math.round(performance.now() - t0)}ms / 1台あたり`,
    stats(loginMs),
  );
  if (stats(loginMs).p95 > 3000)
    problem(
      '注意',
      `ID＋パスワードのログインが同時100人でp95 ${stats(loginMs).p95}ms（QRなら${stats(qrMs).p95}ms）`,
    );

  // --- 画面そのものの重さ（通信量） -----------------------------------------
  {
    const html = await req(phones[0].jar, 'GET', '/game');
    const scripts = [...(html.text ?? '').matchAll(/src="(\/_next\/static\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    let js = 0;
    for (const src of [...new Set(scripts)]) {
      const a = await req(newJar(), 'GET', src);
      js += a.bytes;
    }
    const total = html.bytes + js;
    // 実際の回線を流れるのは圧縮後。本番（Vercel）はgzip/brotliで配るので
    // おおよそ1/3になる（別途curlで実測: 約190KB）
    const wire = total / 3.2;
    console.log(
      `\n[2c] 画面1枚の重さ: 展開後 ${Math.round(total / 1024)}KB / 実際に流れるのは約 ${Math.round(wire / 1024)}KB`,
    );
    console.log(
      `  ${phones.length}台が同時に初回表示すると約 ${((wire * phones.length) / 1024 / 1024).toFixed(1)}MB（2回目以降は端末に残るので流れない）`,
    );
    if ((wire * phones.length) / 1024 / 1024 > 15)
      problem(
        '注意',
        `受付の数分に、初回表示だけで約${((wire * phones.length) / 1024 / 1024).toFixed(1)}MBが会場の回線に集中する`,
      );
  }

  // --- 全員が最初の画面を開く ----------------------------------------------
  console.log(`\n[3] 全員が画面を開く（初回の状態取得）`);
  t0 = performance.now();
  const firstMs = [];
  await Promise.all(
    phones.map(async (p) => {
      const r = await req(p.jar, 'GET', '/api/participant/state');
      firstMs.push(r.ms);
      if (r.status !== 200) problem('重大', `状態取得失敗 ${p.displayName}: ${r.status}`);
      checkLeak(p.displayName, r.json);
      p.state = r.json;
    }),
  );
  console.log(
    `  全員そろうまで ${Math.round(performance.now() - t0)}ms / 1台あたり`,
    stats(firstMs),
  );
  const stateBytes = samples.filter((s) => s.path === '/api/participant/state').map((s) => s.bytes);
  console.log(
    `  1回あたりの通信量 中央値 ${stats(stateBytes).p50}B / 最大 ${stats(stateBytes).max}B`,
  );

  // --- 裏で全員がポーリングし続ける状態を作る -------------------------------
  let polling = true;
  const pollMs = [];
  const pollErrors = [];
  const pollers = phones.map(async (p) => {
    // 端末ごとに開始をずらす（実機と同じ）
    await sleep(Math.random() * 15000);
    while (polling) {
      const r = await req(p.jar, 'GET', '/api/participant/state');
      pollMs.push(r.ms);
      if (r.status !== 200) pollErrors.push(r.status);
      else checkLeak(p.displayName, r.json);
      p.state = r.json ?? p.state;
      await sleep(15000 * (0.8 + Math.random() * 0.4));
    }
  });

  /** フェーズ変更＋そのあとの一斉更新（Realtimeで全員に同時に届く想定） */
  async function phaseChange(to, note) {
    console.log(`\n${note}`);
    await sleep(1500);
    const t = performance.now();
    const r = await req(admin, 'POST', `/api/admin/events/${eventId}/phase`, { to });
    const adminMs = Math.round(performance.now() - t);
    if (r.status !== 200) {
      problem('重大', `フェーズ変更失敗 ${to}: ${r.status} ${r.text?.slice(0, 160)}`);
      return;
    }
    console.log(`  運営のボタンが返るまで ${adminMs}ms`);
    if (adminMs > 1000) problem('注意', `${note}の反映に${adminMs}ms（1秒超）かかった`);

    // 100台が0〜1.5秒に散らばって一斉に取りに来る
    const burst = [];
    const tb = performance.now();
    await Promise.all(
      phones.map(async (p) => {
        await sleep(Math.random() * 1500);
        const s = await req(p.jar, 'GET', '/api/participant/state');
        burst.push(s.ms);
        if (s.status !== 200) problem('重大', `一斉更新で失敗 ${p.displayName}: ${s.status}`);
        else checkLeak(p.displayName, s.json);
        p.state = s.json ?? p.state;
      }),
    );
    const wall = Math.round(performance.now() - tb);
    console.log(`  全員の画面が変わるまで ${wall}ms / 1台あたり`, stats(burst));
    if (stats(burst).p95 > 2000) problem('注意', `${note}の一斉更新でp95が${stats(burst).p95}ms`);
    return { adminMs, burst: stats(burst), wall };
  }

  // --- SPYを決める ----------------------------------------------------------
  console.log(`\n[4] SPYを自動選出`);
  t0 = performance.now();
  const spies = await req(admin, 'POST', `/api/admin/events/${eventId}/spies`, { mode: 'auto' });
  console.log(`  ${Math.round(performance.now() - t0)}ms  status=${spies.status}`);
  if (spies.status >= 400)
    problem('重大', `SPY選出失敗: ${spies.status} ${spies.text?.slice(0, 160)}`);

  await phaseChange('ACTIVE', '[5] ゲーム開始');

  // --- 当日の飛び込み参加（受付用の共通QRから入る人） -----------------------
  console.log(`\n[5b] ゲーム開始後の飛び込み参加`);
  {
    const walkIn = newJar();
    const r = await req(walkIn, 'POST', '/api/participant/join', {
      code,
      displayName: '当日参加A',
      affiliation: '',
    });
    if (r.status !== 201)
      problem('重大', `ゲーム開始後に飛び込み参加できない: ${r.status} ${r.text?.slice(0, 140)}`);
    else {
      const st = await req(walkIn, 'GET', '/api/participant/state');
      const n = (st.json?.missions ?? []).length;
      console.log(`  入れた。MISSIONは ${n} 件`);
      if (n === 0) problem('注意', '飛び込み参加した人にMISSIONが配られていない');
    }
  }

  // --- MISSION達成の報告が散発的に飛ぶ --------------------------------------
  console.log(`\n[6] MISSION達成の報告（全員が自分のぶんを押す）`);
  t0 = performance.now();
  const completeMs = [];
  await Promise.all(
    phones.map(async (p) => {
      await sleep(Math.random() * 3000);
      const missions = p.state?.missions ?? [];
      for (const m of missions.slice(0, 2)) {
        const r = await req(p.jar, 'POST', '/api/participant/missions/complete', {
          assignmentId: m.assignmentId ?? m.id,
          completed: true,
        });
        completeMs.push(r.ms);
        if (r.status >= 400)
          problem(
            '注意',
            `MISSION達成の報告が失敗 ${p.displayName}: ${r.status} ${r.text?.slice(0, 100)}`,
          );
      }
    }),
  );
  console.log(
    `  ${completeMs.length}件 / ${Math.round(performance.now() - t0)}ms / 1件あたり`,
    stats(completeMs),
  );

  // --- ランキングを全員が開く -----------------------------------------------
  console.log(`\n[7] 全員がランキングを開く`);
  t0 = performance.now();
  const rankMs = [];
  await Promise.all(
    phones.map(async (p) => {
      const r = await req(p.jar, 'GET', '/api/participant/ranking');
      rankMs.push(r.ms);
      if (r.status !== 200) problem('重大', `ランキング取得失敗: ${r.status}`);
    }),
  );
  console.log(
    `  全員そろうまで ${Math.round(performance.now() - t0)}ms / 1台あたり`,
    stats(rankMs),
  );

  await phaseChange('SPY_MISSION_REVEALED', '[8] SPY MISSION公開');
  // SPY MISSION公開のあとに来た人はどうなるか
  console.log(`\n[8b] SPY MISSION公開後の飛び込み参加`);
  {
    expectingFailure = true;
    const walkIn = newJar();
    const r = await req(walkIn, 'POST', '/api/participant/join', {
      code,
      displayName: '当日参加B',
      affiliation: '',
    });
    expectingFailure = false;
    if (r.status === 201) console.log('  入れた');
    else {
      console.log(`  入れない（${r.status} ${r.json?.error?.code ?? ''}）`);
      problem(
        '注意',
        `SPY MISSION公開後は飛び込み参加できない（${r.json?.error?.code}）。遅れて来た人は受付で入れない`,
      );
    }
  }

  await phaseChange('VOTING', '[9] 投票開始');

  // --- 投票：100台が同時に、最大10人ぶん送る --------------------------------
  console.log(`\n[10] 投票：全員が同時に送信（最大10人まで選択）`);
  const candMs = [];
  const voteMs = [];
  t0 = performance.now();
  await Promise.all(
    phones.map(async (p) => {
      await sleep(Math.random() * 2000);
      const c = await req(p.jar, 'GET', '/api/participant/vote/candidates');
      candMs.push(c.ms);
      if (c.status !== 200) {
        problem('重大', `投票先一覧の取得失敗 ${p.displayName}: ${c.status}`);
        return;
      }
      const ids = (c.json.candidates ?? [])
        .map((x) => x.id)
        .filter((id) => id !== p.id)
        .slice(0, 3 + Math.floor(Math.random() * 8)); // 3〜10人
      if (ids.length === 0) {
        problem('重大', `投票先が0人 ${p.displayName}`);
        return;
      }
      const v = await req(p.jar, 'POST', '/api/participant/vote', { targetIds: ids });
      voteMs.push(v.ms);
      if (v.status !== 201)
        problem('重大', `投票失敗 ${p.displayName}: ${v.status} ${v.text?.slice(0, 140)}`);
      p.votedIds = ids;
    }),
  );
  console.log(`  投票先一覧 1台あたり`, stats(candMs));
  console.log(
    `  投票の送信 1台あたり`,
    stats(voteMs),
    `/ 全員そろうまで ${Math.round(performance.now() - t0)}ms`,
  );

  // --- 二重送信（連打・電波が戻ったときの再送）を防げているか ---------------
  console.log(`\n[11] 二重送信の防止（同じ人が投票をもう一度送る）`);
  expectingFailure = true; // ここでの失敗は「防げている」という意味なのでエラー集計から外す
  const p0 = phones[0];
  const again = await req(p0.jar, 'POST', '/api/participant/vote', {
    targetIds: p0.votedIds ?? [],
  });
  if (again.status === 201) problem('重大', '同じ人が2回投票できてしまう');
  else console.log(`  2回目は拒否された（${again.status} ${again.json?.error?.code ?? ''}）`);

  // 連打（同時に5回）
  const rapid = await Promise.all(
    Array.from({ length: 5 }, () =>
      req(phones[1].jar, 'POST', '/api/participant/vote', { targetIds: [phones[0].id] }),
    ),
  );
  const accepted = rapid.filter((r) => r.status === 201).length;
  if (accepted > 1) problem('重大', `連打で${accepted}回ぶん投票が入った（1回であるべき）`);
  else console.log(`  5連打しても入ったのは ${accepted} 回`);

  expectingFailure = false;

  await phaseChange('IDENTITY_REVEALED', '[12] 正体公開');

  // --- 結果発表：全員が同時に結果を開く -------------------------------------
  console.log(`\n[13] 結果発表：全員が同時に結果を開く`);
  t0 = performance.now();
  const resultMs = [];
  const resultBytes = [];
  await Promise.all(
    phones.map(async (p) => {
      const r = await req(p.jar, 'GET', '/api/participant/result');
      resultMs.push(r.ms);
      resultBytes.push(r.bytes);
      if (r.status !== 200)
        problem('重大', `結果取得失敗 ${p.displayName}: ${r.status} ${r.text?.slice(0, 120)}`);
    }),
  );
  console.log(
    `  全員そろうまで ${Math.round(performance.now() - t0)}ms / 1台あたり`,
    stats(resultMs),
  );
  console.log(
    `  1回あたりの通信量 中央値 ${stats(resultBytes).p50}B / 最大 ${stats(resultBytes).max}B`,
  );

  // --- 運営画面の重さ（当日は運営もずっと開いている） -----------------------
  console.log(`\n[14] 運営画面（100台がポーリング中）`);
  for (const [name, path] of [
    ['ダッシュボード', `/api/admin/events/${eventId}/dashboard`],
    ['参加者一覧', `/api/admin/events/${eventId}/participants`],
    ['ランキング', `/api/admin/events/${eventId}/ranking`],
    ['結果', `/api/admin/events/${eventId}/results`],
  ]) {
    const r = await req(admin, 'GET', path);
    console.log(`  ${name}: ${Math.round(r.ms)}ms / ${r.bytes}B / status=${r.status}`);
    if (r.status !== 200) problem('重大', `${name}の取得失敗: ${r.status}`);
    if (r.ms > 1500) problem('注意', `${name}が${Math.round(r.ms)}ms`);
  }

  polling = false;
  await Promise.all(pollers);

  // --- まとめ ---------------------------------------------------------------
  console.log(`\n\n=== まとめ ===`);
  console.log(
    `裏で流し続けた定期更新: ${pollMs.length}回 / 失敗 ${pollErrors.length}回`,
    stats(pollMs),
  );

  const byPath = new Map();
  for (const s of samples) {
    if (!byPath.has(s.path)) byPath.set(s.path, []);
    byPath.get(s.path).push(s);
  }
  console.log(`\n道筋ごとの応答時間（ms）とエラー`);
  const rows = [...byPath.entries()]
    .map(([path, list]) => ({
      path,
      ...stats(list.map((x) => x.ms)),
      err: list.filter((x) => (x.status >= 400 || x.status === 0) && !x.expected).length,
      bytes: Math.round(list.reduce((a, b) => a + b.bytes, 0) / list.length),
    }))
    .sort((a, b) => b.p95 - a.p95);
  console.table(rows);

  const total = samples.length;
  const errs = samples.filter((s) => (s.status >= 400 || s.status === 0) && !s.expected).length;
  console.log(
    `\n総リクエスト ${total} 件 / エラー ${errs} 件 (${((errs / total) * 100).toFixed(2)}%)`,
  );

  console.log(`\n見つかった問題: ${problems.length}件`);
  for (const p of problems) console.log(`  [${p.severity}] ${p.what}`);

  // 片付け（投票が入っているので消せない想定。しまうだけにする）
  expectingFailure = true;
  const del = await req(admin, 'DELETE', `/api/admin/events/${eventId}`);
  console.log(`\n後片付け: 削除 status=${del.status} ${del.json?.error?.code ?? ''}`);

  console.log(JSON.stringify({ rows, problems, total, errs }, null, 0).slice(0, 0));
}

main().catch((e) => {
  console.error('デモが途中で止まった:', e);
  process.exit(1);
});
