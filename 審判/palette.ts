/**
 * core/palette — 岩絵具・墨を模した顔料パレットと色演算。
 * すべての描画色はここを経由させ、退色（モノクローム化）などの
 * グローバルな色調演出を一箇所で制御できるようにする。
 */
import { clamp } from './math';
export type RGB = readonly [number, number, number];
export const hex = (h: string): RGB => {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
export const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = clamp(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
export const scale = (c: RGB, k: number): RGB => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
export const css = (c: RGB, a = 1): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
/** 顔料（岩絵具・墨・箔） */
export const PIGMENT = {
  gofun: hex('#efe8d6'), // 胡粉（貝殻の白）
  kinari: hex('#e2d6b8'), // 生成り
  torinoko: hex('#d8c79c'), // 鳥の子色
  aiNezu: hex('#6a7882'), // 藍鼠
  namari: hex('#54585c'), // 鉛色
  nibi: hex('#3a3d42'), // 鈍色
  oudo: hex('#b4873a'), // 黄土
  kin: hex('#c79f48'), // 金泥
  kinpaku: hex('#d9b560'), // 金箔
  kinKage: hex('#8a6524'), // 金の陰
  shu: hex('#c23a1e'), // 朱
  bengara: hex('#8c2c1b'), // 弁柄
  enji: hex('#5c1512'), // 臙脂（暗赤）
  chi: hex('#7d0f0c'), // 血
  konjou: hex('#1c2740'), // 紺青
  gunjou: hex('#2f3f66'), // 群青
  susu: hex('#1a1412'), // 煤
  sumi: hex('#0b0908'), // 濃墨
  usuzumi: hex('#4a4541'), // 薄墨
} as const;
/** 退色先となる冷たい灰のトーン（わずかに青みを帯びる） */
const COLD: RGB = [0.94, 0.99, 1.07];
/**
 * 彩度を失わせ、冷たいモノクロームへ寄せる。
 * @param amount 0=原色, 1=完全なモノクローム
 */
export const desaturate = (c: RGB, amount: number): RGB => {
  if (amount <= 0) return c;
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const k = clamp(amount);
  return [
    clamp(c[0] + (l * COLD[0] - c[0]) * k, 0, 255),
    clamp(c[1] + (l * COLD[1] - c[1]) * k, 0, 255),
    clamp(c[2] + (l * COLD[2] - c[2]) * k, 0, 255),
  ];
};