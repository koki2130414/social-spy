/**
 * アプリアイコンの生成スクリプト。
 *
 *   node scripts/generate-icons.mjs
 *
 * 生成した PNG はリポジトリにコミットしてあるため、通常のビルドでは実行不要です。
 * アイコンの意匠を変更したときだけ再実行してください。
 *
 * フォントに依存すると環境によって描画が変わるため、図形のみで構成しています。
 * モチーフ: 黒地に伏せ字（redacted）の3本線。中央の1本だけが赤＝隠された情報。
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const INK = '#0A0A0A';
const LIGHT = '#EDEDED';
const DIM = '#8C8C8C';
const ALERT = '#E01E1E';
const INTEL = '#B6E640';

/**
 * @param {number} size    出力サイズ
 * @param {boolean} maskable  マスカブル（安全領域を確保して余白を広く取る）
 */
function svg(size, maskable) {
  const S = 512; // 内部座標系
  // maskable は中央 80% 円が安全領域。図案を 62% に収める
  const contentScale = maskable ? 0.62 : 0.78;
  const w = S * contentScale;
  const x = (S - w) / 2;

  const barH = w * 0.155;
  const gap = w * 0.115;
  const totalH = barH * 3 + gap * 2;
  const y0 = (S - totalH) / 2;

  const bars = [
    { w: w * 1.0,  fill: LIGHT, o: 0.92 },
    { w: w * 0.72, fill: ALERT, o: 1 },
    { w: w * 0.86, fill: DIM,   o: 0.85 },
  ];

  const barSvg = bars
    .map((b, i) => {
      const bx = x + (i === 1 ? 0 : 0); // 左揃え（書類の行に見せる）
      return `<rect x="${bx}" y="${y0 + i * (barH + gap)}" width="${b.w}" height="${barH}" rx="${barH * 0.16}" fill="${b.fill}" opacity="${b.o}"/>`;
    })
    .join('');

  // 背景の細いグリッド（機密文書の方眼）
  const grid = maskable
    ? ''
    : Array.from({ length: 7 }, (_, i) => {
        const p = ((i + 1) * S) / 8;
        return `<line x1="${p}" y1="0" x2="${p}" y2="${S}" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="1"/>
                <line x1="0" y1="${p}" x2="${S}" y2="${p}" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="1"/>`;
      }).join('');

  const frame = maskable
    ? ''
    : `<rect x="26" y="26" width="${S - 52}" height="${S - 52}" rx="18" fill="none" stroke="${INTEL}" stroke-opacity="0.55" stroke-width="7"/>`;

  const corner = maskable ? 0 : S * 0.2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${corner}" fill="${INK}"/>
  ${grid}
  ${frame}
  ${barSvg}
</svg>`;
}

async function write(path, size, maskable) {
  const buf = Buffer.from(svg(size, maskable));
  await sharp(buf).png().toFile(join(root, path));
  console.log('wrote', path, size + 'px', maskable ? '(maskable)' : '');
}

await mkdir(join(root, 'public/icons'), { recursive: true });

await write('public/icons/icon-192.png', 192, false);
await write('public/icons/icon-512.png', 512, false);
await write('public/icons/icon-maskable-192.png', 192, true);
await write('public/icons/icon-maskable-512.png', 512, true);
await write('public/icons/apple-touch-icon.png', 180, true);
await write('src/app/icon.png', 64, false);
await write('src/app/apple-icon.png', 180, true);

console.log('done');
