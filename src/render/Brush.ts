/**
 * render/Brush — 墨線ブラシ。
 *
 * 折れ線を「幅が変化する塗りポリゴン」として描くことで、
 * 筆の入り（打ち込み）・抜き（払い）・運筆の揺らぎを再現する。
 * dry を与えると穂先が割れた「かすれ」の筋を重ねる。
 * 乱数はすべてシード駆動のため、同じシードなら完全に同じ線になる
 * （＝左右反転しても寸分違わぬ対称の線が引ける）。
 */
import { TAU, fbm1, hash, noise1, smoothstep } from '../core/math';
export interface InkStyle {
  /** CSS カラー */
  color: string;
  /** 最大の線幅（px） */
  width: number;
  /** 運筆の乱数シード */
  seed: number;
  /** 入りの長さ（全長比） */
  taperIn?: number;
  /** 抜きの長さ（全長比） */
  taperOut?: number;
  /** 線幅の揺らぎ 0..1 */
  wobble?: number;
  /** 打ち込みの溜まりの強さ 0..1 */
  press?: number;
  /** かすれ 0..1 */
  dry?: number;
}
const CAP = 1024;
const LX = new Float32Array(CAP);
const LY = new Float32Array(CAP);
const RX = new Float32Array(CAP);
const RY = new Float32Array(CAP);
const TT = new Float32Array(CAP);
/** 強弱のある墨線を引く。pts は [x0,y0,x1,y1,...]。 */
export function inkStroke(ctx: CanvasRenderingContext2D, pts: ArrayLike<number>, st: InkStyle): void {
  const n = Math.min(pts.length >> 1, CAP);
  if (n < 2 || st.width <= 0.01) return;
  let total = 0;
  TT[0] = 0;
  for (let i = 1; i < n; i++) {
    total += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    TT[i] = total;
  }
  if (total < 0.5) return;
  const tIn = st.taperIn ?? 0.1;
  const tOut = st.taperOut ?? 0.38;
  const wobble = st.wobble ?? 0.28;
  const press = st.press ?? 0.4;
  const half = st.width * 0.5;
  const freq = Math.min(14, 2.5 + total / (st.width * 16 + 8));
  const sd = st.seed * 9.173;
  for (let i = 0; i < n; i++) {
    const t = TT[i] / total;
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i < n - 1 ? i + 1 : n - 1;
    let tx = pts[i1 * 2] - pts[i0 * 2];
    let ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // 入り：素早く太り、打ち込みで墨が溜まる ／ 抜き：細く払って消える
    const rise = smoothstep(0, tIn, t);
    const bump = press * Math.exp(-Math.pow((t - tIn * 0.9) / (tIn * 0.8 + 0.02), 2));
    const fall = Math.pow(1 - smoothstep(1 - tOut, 1, t), 1.25);
    let w = half * Math.max(0.03, (rise * (1 - press * 0.35) + bump) * fall);
    w *= 1 + wobble * fbm1(sd + t * freq, 2);
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    LX[i] = x - ty * w;
    LY[i] = y + tx * w;
    RX[i] = x + ty * w;
    RY[i] = y - tx * w;
  }
  ctx.fillStyle = st.color;
  ctx.beginPath();
  ctx.moveTo(LX[0], LY[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(LX[i], LY[i]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(RX[i], RY[i]);
  ctx.closePath();
  ctx.fill();
  const dry = st.dry ?? 0;
  if (dry > 0.01 && st.width > 1.4) drawKasure(ctx, pts, n, total, st, dry);
}
/** かすれ：割れた穂先が紙の目に引っ掛かって残す、途切れがちな細い筋。 */
function drawKasure(
  ctx: CanvasRenderingContext2D,
  pts: ArrayLike<number>,
  n: number,
  total: number,
  st: InkStyle,
  dry: number,
): void {
  const bristles = 3 + Math.round(dry * 3);
  const half = st.width * 0.5;
  const gateFreq = 6 + total / (st.width * 5 + 6);
  const prevAlpha = ctx.globalAlpha;
  ctx.strokeStyle = st.color;
  ctx.lineCap = 'butt';
  for (let b = 0; b < bristles; b++) {
    const hb = hash(st.seed * 3.71 + b * 11.3);
    const offset = (hb * 2 - 1) * half * 1.05;
    ctx.lineWidth = Math.max(0.35, st.width * (0.05 + 0.1 * hash(hb * 91.7)));
    ctx.globalAlpha = prevAlpha * (0.35 + 0.5 * hash(hb * 37.1));
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const t = TT[i] / total;
      // 筆の後半ほど墨が切れ、筋が現れやすい
      const chance = dry * (0.25 + 0.75 * smoothstep(0.25, 0.95, t));
      const on = noise1(st.seed * 5.3 + b * 7.9 + t * gateFreq) < chance && t > 0.06;
      if (!on) {
        pen = false;
        continue;
      }
      const i0 = i > 0 ? i - 1 : 0;
      const i1 = i < n - 1 ? i + 1 : n - 1;
      let tx = pts[i1 * 2] - pts[i0 * 2];
      let ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const x = pts[i * 2] - ty * offset;
      const y = pts[i * 2 + 1] + tx * offset;
      if (pen) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        pen = true;
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = prevAlpha;
}
/** 円弧の点列。jitter は半径方向の手ぶれ（半径比）。 */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  steps: number,
  jitter = 0,
  seed = 0,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const rr = r * (1 + (jitter ? jitter * fbm1(seed * 3.3 + t * 5, 2) : 0));
    out.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return out;
}
/** 渦（螺旋）の点列。r0 から r1 へ半径を変えながら turns 回転する。 */
export function spiralPoints(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  turns: number,
  steps: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + turns * TAU * t;
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}
/** 点列を塗りパスとして積む（beginPath/fill は呼び出し側）。 */
export function tracePath(ctx: CanvasRenderingContext2D, pts: ArrayLike<number>, close = true): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  if (close) ctx.closePath();
}
