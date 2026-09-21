/**
 * 作った文字列をファイルとして保存させる。
 *
 * a 要素を DOM に入れてから押すのが要点。
 * 入れずに click() すると、ブラウザによっては download 属性を無視する。
 *
 * ファイル名は半角英数字にすること。
 * 日本語のファイル名は、環境によってまるごと捨てられて
 * 「download」という拡張子なしのファイルになる（実際に再現した）。
 * そうなると受付でダブルクリックしてもExcelが開かず、当日に困る。
 */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

/** 画像やZIPなど、文字列でないものを保存させる。注意点は上と同じ */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // すぐ消すと保存が始まる前に無効になる端末があるので、少し待ってから開放する
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
