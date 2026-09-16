import { describe, expect, it } from 'vitest';
import { buildParticipantsCsv, CSV_HEADER, type CsvRow } from './participants-csv';

function row(over: Partial<CsvRow> = {}): CsvRow {
  return {
    loginId: '1',
    displayName: '木下 紗菜',
    affiliation: 'インフルエンサー',
    issuedPassword: '2601',
    attending: true,
    joinUrl: 'https://example.test/j/abc',
    ...over,
  };
}

/** 引用符を外して、1行を素の値に戻す（テストで中身を見るため） */
function values(line: string): string[] {
  return line.split(',').map((v) => v.replace(/^="?|^"|"$/g, '').replace(/""/g, '"'));
}

describe('受付用CSV', () => {
  it('見出しと人数ぶんの行が出る', () => {
    const csv = buildParticipantsCsv([row({ loginId: '1' }), row({ loginId: '2' })]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines).toHaveLength(3);
    expect(values(lines[0])).toEqual(CSV_HEADER);
  });

  it('Excelで開いても文字化けしない（BOMが付く）', () => {
    expect(buildParticipantsCsv([row()]).startsWith('﻿')).toBe(true);
  });

  it('パスワードの先頭の0が消えない', () => {
    // ここが消えると、受付で読み上げたパスワードで入れなくなる
    const csv = buildParticipantsCsv([row({ issuedPassword: '0482' })]);
    expect(csv).toContain('="0482"');
    const cells = values(csv.replace(/^﻿/, '').split('\r\n')[1]);
    expect(cells[3]).toBe('0482');
  });

  it('名前にカンマや引用符が入っても列がずれない', () => {
    const csv = buildParticipantsCsv([
      row({ displayName: '山田, 太郎', affiliation: '株式会社"A"' }),
    ]);
    const line = csv.replace(/^﻿/, '').split('\r\n')[1];
    // 引用符の外にあるカンマ＝区切りの数が、列数どおりであること
    const separators = line.replace(/"[^"]*"/g, '').split(',').length - 1;
    expect(separators).toBe(CSV_HEADER.length - 1);
    expect(line).toContain('"山田, 太郎"');
    expect(line).toContain('"株式会社""A"""');
  });

  it('欠席の人はそう書かれる', () => {
    const csv = buildParticipantsCsv([row({ attending: false })]);
    expect(values(csv.replace(/^﻿/, '').split('\r\n')[1])[4]).toBe('欠席');
  });

  it('パスワードが未記録でも落とせる', () => {
    const csv = buildParticipantsCsv([row({ issuedPassword: null })]);
    const cells = values(csv.replace(/^﻿/, '').split('\r\n')[1]);
    expect(cells[3]).toBe('');
    expect(cells[1]).toBe('木下 紗菜');
  });

  it('渡された順のまま並ぶ（画面の並びと一致させる）', () => {
    const csv = buildParticipantsCsv([
      row({ loginId: '3', displayName: 'さん' }),
      row({ loginId: '1', displayName: 'いち' }),
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(values(lines[1])[0]).toBe('3');
    expect(values(lines[2])[0]).toBe('1');
  });
});
