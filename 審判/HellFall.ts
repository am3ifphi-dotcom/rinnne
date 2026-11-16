/**
 * render/HellFall — 墜落の景物。
 * 咆哮の衝撃波／闇の底から伸びる亡者の腕／紅蓮の業火／火の粉／血と墨による暗転。
 * いずれも状態を持たない純粋な描画関数で、時刻と進行度だけから形を決める。
 */
import { TAU, clamp, easeOutCubic, fbm1, fbm2, hash, lerp, smoothstep } from '../core/math';
import { PIGMENT, css, mix } from '../core/palette';
import { arcPoints, inkStroke } from './Brush';
import { drawFlame, type FlamePalette } from './Flames';
/* ════════════ 咆哮の衝撃波 ════════════ */
export function drawShockwave(ctx: CanvasRenderingContext2D, cx: number, cy: number, unit: number, reach: number, roar: number): void {
  if (roar <= 0 || roar >= 1) return;
  const fade = 1 - smoothstep(0.55, 1, roar);
  // 放射状に弾ける楔
  ctx.fillStyle = css(mix(PIGMENT.gofun, PIGMENT.chi, roar), 0.55 * fade);
  ctx.beginPath();
  for (let i = 0; i < 46; i++) {
    const h = hash(i * 4.1 + 0.9);
    const a = (i / 46) * TAU + (h - 0.5) * 0.12;
    const r0 = reach * (0.1 + 0.9 * roar) * (0.5 + 0.4 * h);
    const r1 = r0 + reach * (0.25 + 0.5 * h) * (0.4 + roar);
    const half = 0.012 + 0.02 * h;
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - half) * r1, cy + Math.sin(a - half) * r1);
    ctx.lineTo(cx + Math.cos(a + half) * r1, cy + Math.sin(a + half) * r1);
  }
  ctx.fill();
  // 墨の輪が幾重にも広がる
  for (let k = 0; k < 4; k++) {
    const q = clamp(roar * 1.7 - k * 0.2);
    if (q <= 0 || q >= 1) continue;
    const r = easeOutCubic(q) * reach * 1.25;
    const color = k % 2 === 0 ? css(PIGMENT.sumi, 0.9 * (1 - q)) : css(PIGMENT.chi, 0.8 * (1 - q));
    for (let half = 0; half < 2; half++) {
      const a0 = half * Math.PI + k * 0.9;
      inkStroke(ctx, arcPoints(cx, cy, r, a0, a0 + Math.PI * 1.04, 40, 0.035, k * 3 + half), {
        color,
        width: unit * 0.075 * (1 - q * 0.7),
        seed: 500 + k * 2 + half,
        taperIn: 0.06,
        taperOut: 0.3,
        wobble: 0.6,
        dry: 0.8,
      });
    }
  }
}
/* ════════════ 亡者の腕 ════════════ */
const ARMS = 24;
const armL: number[] = [];
const armR: number[] = [];
const finger: number[] = [];
/**
 * 画面の外（闇の底）から中心へ向かって掴みかかる黒い腕。
 * @param amount 0..1 出現量
 */
export function drawGraspingArms(ctx: CanvasRenderingContext2D, cx: number, cy: number, unit: number, reach: number, amount: number, time: number): void {
  if (amount <= 0.01) return;
  const black = css(mix(PIGMENT.sumi, PIGMENT.enji, 0.12));
  const ash = css(PIGMENT.aiNezu, 0.4);
  for (let i = 0; i < ARMS; i++) {
    const h1 = hash(i * 3.17 + 1.1);
    const h2 = hash(i * 7.31 + 2.7);
    const h3 = hash(i * 11.9 + 5.3);
    const appear = clamp((amount - (i / ARMS) * 0.75) / 0.25);
    if (appear <= 0) continue;
    const a = i * 2.39996 + h1 * 0.5; // 黄金角で散らす
    const grope = 0.06 * Math.sin(time * (1.6 + h2 * 1.5) + i * 2.1);
    const ext = easeOutCubic(appear) * (1 + grope);
    const bx = cx + Math.cos(a) * reach * 1.08;
    const by = cy + Math.sin(a) * reach * 1.08;
    // 手首が届く先：中心へ寄るほど深く掴みかかる
    const targetR = lerp(reach * 1.05, unit * (0.2 + 0.3 * h2), ext);
    const aim = a + (h3 - 0.5) * 0.7 + 0.12 * Math.sin(time * 0.9 + i);
    const wx = cx + Math.cos(aim) * targetR;
    const wy = cy + Math.sin(aim) * targetR;
    // 肘：横へ折れ、わななく
    const mx = (bx + wx) / 2;
    const my = (by + wy) / 2;
    const dx = wx - bx;
    const dy = wy - by;
    const dl = Math.hypot(dx, dy) || 1;
    const bend = (h1 > 0.5 ? 1 : -1) * dl * (0.16 + 0.14 * h3 + 0.05 * Math.sin(time * 2.3 + i * 1.3));
    const ex = mx + (-dy / dl) * bend;
    const ey = my + (dx / dl) * bend;
    const w0 = unit * (0.03 + 0.022 * h2);
    armL.length = 0;
    armR.length = 0;
    const N = 16;
    let tx = 0;
    let ty = 0;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const u = 1 - t;
      const x = u * u * bx + 2 * u * t * ex + t * t * wx;
      const y = u * u * by + 2 * u * t * ey + t * t * wy;
      tx = 2 * u * (ex - bx) + 2 * t * (wx - ex);
      ty = 2 * u * (ey - by) + 2 * t * (wy - ey);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // 痩せさらばえた腕：肘で骨ばり、手首で細る
      const w = w0 * (lerp(1, 0.42, t) + 0.22 * Math.exp(-Math.pow((t - 0.5) / 0.08, 2)) + 0.05 * fbm1(i * 9 + t * 6, 2));
      armL.push(x - ty * w, y + tx * w);
      armR.push(x + ty * w, y - tx * w);
    }
    ctx.fillStyle = black;
    ctx.beginPath();
    ctx.moveTo(armL[0], armL[1]);
    for (let k = 1; k <= N; k++) ctx.lineTo(armL[k * 2], armL[k * 2 + 1]);
    for (let k = N; k >= 0; k--) ctx.lineTo(armR[k * 2], armR[k * 2 + 1]);
    ctx.closePath();
    ctx.fill();
    // 煤けた腕に残る、かすれた灰の照り
    inkStroke(ctx, h1 > 0.5 ? armL : armR, { color: ash, width: w0 * 0.2, seed: 600 + i, taperIn: 0.3, taperOut: 0.3, press: 0, dry: 0.9 });
    // 掌と五指：指は関節ごとに内へ曲がり、掴む動きを繰り返す
    const handA = Math.atan2(ty, tx);
    const palm = w0 * 1.4;
    const px = wx + tx * palm * 0.6;
    const py = wy + ty * palm * 0.6;
    ctx.fillStyle = black;
    ctx.beginPath();
    ctx.ellipse(px, py, palm * 0.95, palm * 0.72, handA, 0, TAU);
    ctx.fill();
    const clutch = 0.3 + 0.28 * Math.sin(time * (2.4 + h3 * 2) + i * 1.7);
    for (let f = 0; f < 5; f++) {
      const spread = f === 0 ? -1.15 : lerp(-0.58, 0.62, (f - 1) / 3);
      const flen = palm * (f === 0 ? 1.35 : 2.2 - 0.26 * Math.abs(f - 2.3)) * (0.9 + 0.2 * hash(i * 5.1 + f));
      let fa = handA + spread;
      let fx = px + Math.cos(fa) * palm * 0.7;
      let fy = py + Math.sin(fa) * palm * 0.7;
      const curlDir = spread > 0 ? -1 : 1;
      finger.length = 0;
      finger.push(fx - Math.cos(fa) * palm * 0.35, fy - Math.sin(fa) * palm * 0.35, fx, fy);
      for (let j = 0; j < 3; j++) {
        fa += curlDir * (clutch + 0.12 * j) * (f === 0 ? 0.5 : 1);
        fx += Math.cos(fa) * flen * (0.42 - 0.07 * j);
        fy += Math.sin(fa) * flen * (0.42 - 0.07 * j);
        finger.push(fx, fy);
      }
      inkStroke(ctx, finger, { color: black, width: palm * 0.5, seed: 700 + i * 5 + f, taperIn: 0.02, taperOut: 0.72, press: 0.25, wobble: 0.35 });
    }
  }
}
/* ════════════ 紅蓮の業火 ════════════ */
const FIRE_OUTER: FlamePalette = { outer: PIGMENT.enji, mid: PIGMENT.shu, core: PIGMENT.oudo, ink: PIGMENT.sumi };
const FIRE_DARK: FlamePalette = { outer: PIGMENT.sumi, mid: PIGMENT.enji, core: PIGMENT.shu, ink: PIGMENT.sumi };
export function drawHellfire(ctx: CanvasRenderingContext2D, cx: number, cy: number, unit: number, reach: number, amount: number, time: number): void {
  if (amount <= 0.01) return;
  const count = 26;
  for (let i = 0; i < count; i++) {
    const h = hash(i * 6.13 + 3.3);
    const a = (i / count) * TAU + (h - 0.5) * 0.18;
    const r0 = reach * 1.04;
    const tip = unit * (0.34 + 0.3 * hash(i * 2.9));
    const len = (r0 - tip) * amount * (0.75 + 0.25 * Math.sin(time * 2.2 + i * 1.9));
    drawFlame(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, a + Math.PI + (h - 0.5) * 0.35, len, unit * (0.13 + 0.1 * h), time, 800 + i, i % 3 === 0 ? FIRE_DARK : FIRE_OUTER, 0.94);
  }
}
/* ════════════ 火の粉 ════════════ */
export function drawEmbers(ctx: CanvasRenderingContext2D, cx: number, cy: number, unit: number, reach: number, travel: number, amount: number): void {
  if (amount <= 0.01) return;
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? css(PIGMENT.shu, 0.85 * amount) : css(PIGMENT.oudo, 0.9 * amount);
    ctx.beginPath();
    for (let i = pass; i < 84; i += 2) {
      const h1 = hash(i * 2.71 + 0.3);
      const h2 = hash(i * 5.33 + 1.7);
      // 下から上へ（＝画面の縁から消失点へ）吸い上げられていく
      const ph = (h2 + travel * 0.05 * (0.5 + h1)) % 1;
      const a = h1 * TAU + ph * 1.4 * (h2 - 0.5);
      const r = reach * 1.1 * Math.exp(-3.1 * ph);
      const size = unit * 0.011 * Math.pow(1 - ph, 1.4) * (0.5 + h2);
      const tail = size * (5 + 9 * h1);
      const half = 0.5 * size;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      ctx.moveTo(x - oy * half, y + ox * half);
      ctx.lineTo(x + ox * tail, y + oy * tail);
      ctx.lineTo(x + oy * half, y - ox * half);
      ctx.lineTo(x - ox * size, y - oy * size);
    }
    ctx.fill();
  }
}
/* ════════════ 血と闇による暗転 ════════════ */
/**
 * @param amount 0..1。前半で血の赤が満ち、後半で縁から墨が流れ込み、1 で完全な漆黒。
 */
export function drawEngulf(ctx: CanvasRenderingContext2D, cx: number, cy: number, reach: number, amount: number, time: number): void {
  if (amount <= 0.001) return;
  const big = reach * 4;
  ctx.fillStyle = css(PIGMENT.chi, 0.88 * smoothstep(0, 0.55, amount));
  ctx.fillRect(cx - big, cy - big, big * 2, big * 2);
  const close = smoothstep(0.3, 0.97, amount);
  if (close <= 0) return;
  if (close >= 0.995) {
    ctx.fillStyle = css(PIGMENT.sumi);
    ctx.fillRect(cx - big, cy - big, big * 2, big * 2);
    return;
  }
  const r = reach * 1.3 * (1 - close);
  // 視界そのものが翳っていく（柔らかな暈し）
  const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.25 + 1);
  g.addColorStop(0, css(PIGMENT.sumi, 0.55 * close));
  g.addColorStop(0.65, css(PIGMENT.sumi, 0.5 + 0.4 * close));
  g.addColorStop(1, css(PIGMENT.sumi, 1));
  ctx.fillStyle = g;
  ctx.fillRect(cx - big, cy - big, big * 2, big * 2);
  // 縁から滲み込む墨：濃度の違う墨が幾重にも、不定形に流れ込む
  const steps = 220;
  for (let layer = 0; layer < 3; layer++) {
    const lr = r * (1.24 - 0.12 * layer);
    ctx.fillStyle = layer === 0 ? css(PIGMENT.enji, 0.5) : css(PIGMENT.sumi, layer === 1 ? 0.72 : 1);
    ctx.beginPath();
    ctx.rect(cx - big, cy - big, big * 2, big * 2);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      // 円周上で継ぎ目のないノイズ（大きなうねり＋細かな滲み）
      const swell = fbm2(ox * 1.5 + layer * 7.3 + time * 0.12, oy * 1.5 + 3.1, 3) * 2 - 1;
      const bleed = fbm2(ox * 5.5 + 11.7, oy * 5.5 + layer * 4.9 - time * 0.2, 3) * 2 - 1;
      const rr = Math.max(0, lr * (1 + 0.42 * swell + 0.16 * bleed));
      if (i === 0) ctx.moveTo(cx + ox * rr, cy + oy * rr);
      else ctx.lineTo(cx + ox * rr, cy + oy * rr);
    }
    ctx.closePath();
    ctx.fill('evenodd');
  }
}
