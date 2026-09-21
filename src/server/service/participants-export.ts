import JSZip from 'jszip';
import QRCode from 'qrcode';
import {
  buildParticipantsCsv,
  type CsvRow,
} from '@/app/admin/(dashboard)/participants/participants-csv';
import { buildJoinUrl, getEvent, listAdminParticipants } from './admin';

/**
 * 受付一覧のCSVと、参加者ひとりずつのQR画像を1つのZIPにまとめる。
 *
 * 当日「カードを忘れた」「印刷し直したい」が起きたときに、
 * 運営のパソコンだけで完結できるようにするためのもの。
 *
 * 気をつけていること。
 *  ・ZIPの中のファイル名は半角数字だけにする。
 *    日本語名は解凍する環境によって文字化けし、誰のQRか分からなくなるため。
 *    誰のものかはCSVの「QR画像」列で引く。
 *  ・番号は3桁に揃える（001.png）。1, 10, 100 が並び替えで混ざらないように。
 *  ・このZIPは全員ぶんの鍵の束になる。受付以外へ渡さない旨をREADMEに書く。
 */

/**
 * ZIPの中のQR画像の名前。
 *
 * 番号がない人はIDで代用する。IDの先頭だけを使うと、
 * 同じ接頭辞のIDどうしで同じ名前になり、片方が上書きされて
 * 別人のQRを配ってしまう。ここはID全体を使う。
 */
export function qrFileName(loginId: string | null, participantId: string): string {
  const n = Number(loginId);
  if (Number.isInteger(n) && n > 0) return `qr/${String(n).padStart(3, '0')}.png`;
  return `qr/no-${participantId.replace(/[^0-9A-Za-z]/g, '')}.png`;
}

const README = [
  'BUZZ BASE 受付データ（QRコード付き）',
  '',
  '中身',
  '  participants.csv … 番号・名前・所属・パスワード・出欠・参加リンク・QR画像ファイル名',
  '  qr/001.png ...   … 参加者ひとりずつのQRコード（ファイル名の数字＝受付番号）',
  '',
  'QRコードについて',
  '  読み取るとその人としてログインします。配った受付カードのQRと同じものです。',
  '  本人以外に見せるとなりすまされます。取り扱いにご注意ください。',
  '',
  'CSVについて',
  '  Excelで開けます。パスワードの先頭の0が消えないようにしてあります。',
  '  受付以外の方へ渡さないでください。',
  '',
].join('\r\n');

export interface ParticipantsExport {
  /** ZIPの中身 */
  body: Uint8Array;
  /** 保存するときのファイル名。半角英数字のみ */
  fileName: string;
}

export async function buildParticipantsExport(eventId: string): Promise<ParticipantsExport> {
  // 権限確認はこの2つの中で行う（getEvent / listAdminParticipants が運営権限を要求する）
  const event = await getEvent(eventId);
  const participants = await listAdminParticipants(eventId);

  // 受付番号の順。画面の並びと同じにして、照合で迷わないようにする
  const sorted = [...participants].sort((a, b) => {
    const na = Number(a.loginId ?? '');
    const nb = Number(b.loginId ?? '');
    if (Number.isInteger(na) && Number.isInteger(nb)) return na - nb;
    if (Number.isInteger(na)) return -1;
    if (Number.isInteger(nb)) return 1;
    return a.displayName.localeCompare(b.displayName, 'ja');
  });

  const zip = new JSZip();
  const rows: CsvRow[] = [];
  // 名前がぶつかると片方が消え、別人のQRを配ってしまう。
  // 番号は重複しない前提だが、ここでも重ならないことを確かめる
  const used = new Set<string>();

  for (const p of sorted) {
    const joinUrl = buildJoinUrl(p.id, eventId);
    let file = qrFileName(p.loginId, p.id);
    if (used.has(file)) file = `qr/${p.id.replace(/[^0-9A-Za-z]/g, '')}.png`;
    used.add(file);
    // カードに刷ったQRと同じ設定。読み取り機がどちらでも同じように読めるようにする
    const png = await QRCode.toBuffer(joinUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
    zip.file(file, png);
    rows.push({
      loginId: p.loginId,
      displayName: p.displayName,
      affiliation: p.affiliation,
      issuedPassword: p.issuedPassword,
      attending: p.attending,
      joinUrl,
      qrFile: file,
    });
  }

  zip.file('participants.csv', buildParticipantsCsv(rows, true));
  zip.file('README.txt', README);

  const body = await zip.generateAsync({ type: 'uint8array' });
  const code = (event.code || 'event').replace(/[^0-9A-Za-z_-]/g, '');
  return { body, fileName: `${code || 'event'}_participants_qr.zip` };
}
