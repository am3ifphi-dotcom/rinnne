/**
 * render/Flames — 地獄草紙風の火焔。
 * 一枚の炎を「うねる舌」として三層（外炎・内炎・芯）に塗り分け、片側に墨の輪郭を添える。
 * 火焔光背と墜落時の業火の双方から利用する。
 */
import { fbm1, hash } from '../core/math';
import { css, type RGB } from '../core/palette';
import { inkStroke } from './Brush';
export interface FlamePalette {
  outer: RGB;
  mid: RGB;
  core: RGB;
  ink: RGB;
}
const SEG = 13;
const CX = new Float32Array(SEG + 1);
const CY = new Float32Array(SEG + 1);
const NX = new Float32Array(SEG + 1);
const NY = new Float32Array(SEG + 1);
const HW = new Float32Array(SEG + 1);
const edge: number[] = [];
/**
 * 炎の舌を1枚描く。
 * @param angle  炎が伸びる向き（ラジアン）
 * @param length 長さ（px）
 * @param width  根元の幅（px）
 */
export function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  time: number,
  seed: number,
  pal: FlamePalette,
  alpha = 1,
): void {
  if (length < 2 || alpha <= 0.01) return;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  const hook = hash(seed * 7.3) > 0.5 ? 1 : -1;
  const speed = 3.4 + 2.2 * hash(seed * 3.9);
  // 中心線：先端ほど大きく揺らぎ、鉤のように巻く
  for (let k = 0; k <= SEG; k++) {
    const t = k / SEG;
    const sway =
      (Math.sin(t * 4.4 - time * speed + seed * 6.1) * 0.55 + fbm1(seed * 2.7 + t * 2.2 - time * 1.3, 2) * 0.6) *
        width *
        0.8 *
        Math.pow(t, 1.15) +
      hook * width * 0.75 * t * t * t;
    CX[k] = x + dx * length * t + px * sway;
    CY[k] = y + dy * length * t + py * sway;
    HW[k] = width * 0.5 * Math.pow(1 - t, 0.72) * (0.86 + 0.22 * Math.sin(t * 9.5 - time * (speed + 2.5) + seed * 3));
  }
  for (let k = 0; k <= SEG; k++) {
    const k0 = k > 0 ? k - 1 : 0;
    const k1 = k < SEG ? k + 1 : SEG;
    const tx = CX[k1] - CX[k0];
    const ty = CY[k1] - CY[k0];
    const tl = Math.hypot(tx, ty) || 1;
    NX[k] = -ty / tl;
    NY[k] = tx / tl;
  }
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  const layers: Array<[RGB, number, number]> = [
    [pal.outer, 1, SEG],
    [pal.mid, 0.58, Math.round(SEG * 0.8)],
    [pal.core, 0.26, Math.round(SEG * 0.55)],
  ];
  for (const [color, scale, last] of layers) {
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(CX[0] + NX[0] * HW[0] * scale, CY[0] + NY[0] * HW[0] * scale);
    for (let k = 1; k <= last; k++) {
      const taper = k === last ? 0.04 : 1;
      ctx.lineTo(CX[k] + NX[k] * HW[k] * scale * taper, CY[k] + NY[k] * HW[k] * scale * taper);
    }
    for (let k = last; k >= 0; k--) {
      const taper = k === last ? 0.04 : 1;
      ctx.lineTo(CX[k] - NX[k] * HW[k] * scale * taper, CY[k] - NY[k] * HW[k] * scale * taper);
    }
    ctx.closePath();
    ctx.fill();
  }
  // 巻き込む側に墨の輪郭を一筆
  edge.length = 0;
  for (let k = 0; k <= SEG; k++) edge.push(CX[k] + NX[k] * HW[k] * hook, CY[k] + NY[k] * HW[k] * hook);
  inkStroke(ctx, edge, {
    color: css(pal.ink),
    width: Math.max(0.8, width * 0.075),
    seed: seed * 1.37,
    taperIn: 0.05,
    taperOut: 0.55,
    press: 0.3,
  });
  ctx.globalAlpha = prev;
}
