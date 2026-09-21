/**
 * 受付用の参加者一覧をCSVにする。
 *
 * 画面から切り離してあるのは、当日いちばん困る2点をテストで固定するため。
 *  ・パスワードの先頭の 0 が消えないこと（0482 が 482 になると入れない）
 *  ・名前にカンマや引用符が入っていても列がずれないこと
 */

export interface CsvRow {
  loginId: string | null;
  displayName: string;
  affiliation: string | null;
  issuedPassword: string | null;
  attending: boolean;
  joinUrl: string;
  /** ZIPに入れるQR画像のファイル名。CSV単体で落とすときは付けない */
  qrFile?: string | null;
}

export const CSV_HEADER = ['番号', '名前', '所属・肩書き', 'パスワード', '出欠', '参加リンク'];

/** QR画像と一緒にZIPで落とすときの見出し。どの画像が誰かを対応づける列が増える */
export const CSV_HEADER_WITH_QR = [...CSV_HEADER, 'QR画像'];

/** CSVの1マス。引用符は2つ重ねて打ち消す */
function cell(value: string | number | null): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * パスワードのマス。
 *
 * そのまま 0482 と書くと Excel が数値とみなして 482 にしてしまい、
 * 受付でそのまま読み上げると入れない。
 * ="0482" の形にすると Excel は文字列として扱う。
 */
function passwordCell(password: string | null): string {
  if (!password) return cell('');
  return `="${password.replace(/"/g, '')}"`;
}

/**
 * 表示されている順のまま並べる。並べ替えは呼び出し側の責任。
 *
 * withQr を立てると末尾にQR画像の列が増える（ZIPに同梱するとき用）。
 * 列の並びは増やす側だけにして、既存の列の位置は動かさない。
 * 受付が見慣れた並びのまま使えるようにするため。
 */
export function buildParticipantsCsv(rows: readonly CsvRow[], withQr = false): string {
  const header = withQr ? CSV_HEADER_WITH_QR : CSV_HEADER;
  const lines = rows.map((r) =>
    [
      cell(r.loginId),
      cell(r.displayName),
      cell(r.affiliation),
      passwordCell(r.issuedPassword),
      cell(r.attending ? '出席' : '欠席'),
      cell(r.joinUrl),
      ...(withQr ? [cell(r.qrFile ?? '')] : []),
    ].join(','),
  );
  // 先頭のBOM(\uFEFF)は Excel で開いたときの文字化けよけ。
  // 目に見えない文字なので、ソースにはエスケープで書いておく
  return '\uFEFF' + [header.join(','), ...lines].join('\r\n');
}
