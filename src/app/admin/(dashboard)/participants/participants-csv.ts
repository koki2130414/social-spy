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
}

export const CSV_HEADER = ['番号', '名前', '所属・肩書き', 'パスワード', '出欠', '参加リンク'];

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

/** 表示されている順のまま並べる。並べ替えは呼び出し側の責任 */
export function buildParticipantsCsv(rows: readonly CsvRow[]): string {
  const lines = rows.map((r) =>
    [
      cell(r.loginId),
      cell(r.displayName),
      cell(r.affiliation),
      passwordCell(r.issuedPassword),
      cell(r.attending ? '出席' : '欠席'),
      cell(r.joinUrl),
    ].join(','),
  );
  // 先頭のBOM(\uFEFF)は Excel で開いたときの文字化けよけ。
  // 目に見えない文字なので、ソースにはエスケープで書いておく
  return '\uFEFF' + [CSV_HEADER.join(','), ...lines].join('\r\n');
}
