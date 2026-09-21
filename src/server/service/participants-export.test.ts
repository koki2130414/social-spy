import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('next/headers', () => import('@/test/next-headers-mock'));

import { cookieJar } from '@/test/next-headers-mock';
import { resetDemoState } from '@/server/repo/demo-repo';
import { adminLogin, buildJoinUrl, registerParticipant } from '@/server/service/admin';
import { buildParticipantsExport, qrFileName } from '@/server/service/participants-export';
import { loginParticipant } from '@/server/service/participant';
import { DEMO_EVENT_ID, DEMO_EVENT_CODE } from '@/server/demo/seed';

/**
 * 受付一覧CSVと全員ぶんのQR画像をまとめたZIP。
 *
 * 当日の配り物を作り直すためのもの。中身は全員ぶんの鍵の束になるので、
 * 運営以外が取れないことと、中身が取り違わっていないことを固定しておく。
 *
 * ここで守りたいのは次の4つ。
 *  ・運営としてログインしていないと取れないこと
 *  ・人数ぶんのQR画像が入っていて、CSVの「QR画像」列と対応していること
 *  ・パスワードの先頭の0が消えないこと（Excelで開くため）
 *  ・ZIPの中のファイル名が半角英数字であること（解凍先で文字化けすると誰のか分からなくなる）
 */

async function loginAsAdmin() {
  await adminLogin('admin@socialspy.demo', 'spy-demo-2026');
}

async function openZip() {
  const { body, fileName } = await buildParticipantsExport(DEMO_EVENT_ID);
  return { zip: await JSZip.loadAsync(body), fileName };
}

/** CSVを行ごとの列配列に戻す（引用符は外す） */
async function csvRows(zip: JSZip) {
  const text = (await zip.file('participants.csv')!.async('string')).replace(/^\uFEFF/, '');
  return text.split('\r\n').map((line) => {
    const cells = line.match(/(="[^"]*"|"(?:[^"]|"")*")/g) ?? [];
    return cells.map((c) => c.replace(/^="?|^"|"$/g, '').replace(/""/g, '"'));
  });
}

describe('CSV＋QRのZIP', () => {
  beforeEach(async () => {
    cookieJar.clear();
    resetDemoState();
    await loginAsAdmin();
  });

  it('運営としてログインしていないと取れない', async () => {
    cookieJar.clear();
    await expect(buildParticipantsExport(DEMO_EVENT_ID)).rejects.toThrow();
  });

  it('参加者としてログインしていても取れない（全員ぶんの鍵の束のため）', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: '参加者',
      loginId: '70',
    });
    cookieJar.clear();
    await loginParticipant({
      code: DEMO_EVENT_CODE,
      loginId: '70',
      password: created.credentials.password,
    });

    await expect(buildParticipantsExport(DEMO_EVENT_ID)).rejects.toThrow();
  });

  it('人数ぶんのQR画像が入り、CSVの行と1対1で対応する', async () => {
    const { zip } = await openZip();
    const rows = await csvRows(zip);
    const body = rows.slice(1).filter((r) => r.length > 0);
    const images = Object.keys(zip.files).filter((n) => n.startsWith('qr/') && !zip.files[n].dir);

    expect(body.length).toBeGreaterThan(0);
    expect(images).toHaveLength(body.length);
    // CSVが指しているファイルが、全部ちゃんと入っていること
    for (const row of body) {
      const file = row[6];
      expect(images).toContain(file);
    }
    // 同じ画像を2人が指していないこと（取り違えたら別人としてログインしてしまう）
    expect(new Set(body.map((r) => r[6])).size).toBe(body.length);
  });

  it('QR画像がその人のリンクを符号化している', async () => {
    const created = await registerParticipant(DEMO_EVENT_ID, {
      displayName: 'QR確認',
      loginId: '71',
    });
    const { zip } = await openZip();

    const file = qrFileName('71', created.participant.id);
    const png = await zip.file(file)!.async('uint8array');
    const QRCode = (await import('qrcode')).default;
    const expected = await QRCode.toBuffer(buildJoinUrl(created.participant.id, DEMO_EVENT_ID), {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
    expect(Buffer.from(png).equals(expected)).toBe(true);
  });

  it('パスワードの先頭の0が消えない', async () => {
    await registerParticipant(DEMO_EVENT_ID, { displayName: 'ゼロ始まり', loginId: '72' });
    const { zip } = await openZip();
    const text = await zip.file('participants.csv')!.async('string');

    // 記録されている数字4桁が、そのままの桁数で読み出せること
    const rows = await csvRows(zip);
    const passwords = rows.slice(1).map((r) => r[3]);
    for (const pw of passwords.filter(Boolean)) {
      expect(pw).toMatch(/^\d{4}$/);
      expect(text).toContain(`="${pw}"`);
    }
    expect(text.startsWith('\uFEFF')).toBe(true);
  });

  it('ZIPの中のファイル名が半角英数字だけ（解凍先で文字化けしない）', async () => {
    const { zip, fileName } = await openZip();
    for (const name of Object.keys(zip.files).filter((n) => !zip.files[n].dir)) {
      expect(name).toMatch(/^[0-9A-Za-z._/-]+$/);
    }
    expect(fileName).toMatch(/^[0-9A-Za-z._-]+\.zip$/);
  });

  it('番号は3桁に揃える（1・10・100が並び替えで混ざらないように）', () => {
    expect(qrFileName('1', 'abcdef123456')).toBe('qr/001.png');
    expect(qrFileName('101', 'abcdef123456')).toBe('qr/101.png');
    // 番号が無い人でも、誰のものか分かる名前にする
    // IDの先頭だけを使うと、接頭辞が同じ人どうしで同じ名前になってしまう
    expect(qrFileName(null, 'pt-demo-0000-0001')).toBe('qr/no-ptdemo00000001.png');
    expect(qrFileName(null, 'pt-demo-0000-0002')).not.toBe(qrFileName(null, 'pt-demo-0000-0001'));
  });
});
