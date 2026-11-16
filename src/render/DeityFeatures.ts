/**
 * render/DeityFeatures — 顔面の部品（眼・ひび割れ・口）。
 * いずれも「顔中心を原点とする px 座標」で描く。左右反転は呼び出し側の変換行列に任せる。
 */
import { TAU, clamp, fbm1, hash, lerp, mulberry32, smoothstep } from '../core/math';
import { PIGMENT, mix, type RGB } from '../core/palette';
import { inkStroke, tracePath } from './Brush';
/** 色調（退色）を通した CSS カラーを返す関数 */
export type Tone = (c: RGB, a?: number) => string;
/* ════════════ 眼 ════════════ */
export interface EyeSpec {
  x: number;
  y: number;
  /** 半幅（px） */
  w: number;
  /** 上瞼・下瞼の開き（px） */
  up: number;
  low: number;
  /** 傾き（ラジアン） */
  tilt: number;
  irisR: number;
  pupilR: number;
  /** 視線のずれ（px, 眼のローカル座標） */
  lookX: number;
  lookY: number;
  /** 充血 0..1 */
  bloodshot: number;
  seed: number;
  sclera: RGB;
  iris: RGB;
  /** 瞼の墨線の太さ（px） */
  line: number;
  /** 瞳の奥の冷たい光 0..1 */
  glint: number;
}
const lid: number[] = [];
function lidPoints(w: number, h: number, upper: boolean, steps: number): number[] {
  // 上瞼は目頭側が鋭く目尻へ長く流れる。下瞼は浅い弧。
  lid.length = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(-w, w, t);
    const arch = upper ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.82)), 0.85) : Math.pow(Math.sin(Math.PI * t), 0.9);
    lid.push(x, (upper ? -h : h) * arch);
  }
  return lid;
}
export function drawEye(ctx: CanvasRenderingContext2D, e: EyeSpec, tone: Tone): void {
  if (e.up + e.low < 0.6) {
    // 閉じた眼：一本の墨線
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.tilt);
    inkStroke(ctx, lidPoints(e.w, e.w * 0.06, false, 14), {
      color: tone(PIGMENT.sumi),
      width: e.line,
      seed: e.seed,
      taperIn: 0.1,
      taperOut: 0.4,
    });
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.tilt);
  // 眼裂でクリップ
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, lidPoints(e.w, e.up, true, 18), false);
  const lower = lidPoints(e.w, e.low, false, 18);
  for (let i = 18; i >= 0; i--) ctx.lineTo(lower[i * 2], lower[i * 2 + 1]);
  ctx.closePath();
  ctx.clip();
  const sclera = mix(e.sclera, PIGMENT.oudo, e.bloodshot * 0.35);
  ctx.fillStyle = tone(sclera);
  ctx.fillRect(-e.w * 1.1, -e.up * 1.3 - 2, e.w * 2.2, (e.up + e.low) * 1.3 + 4);
  // 充血：眼の縁から瞳へ這い寄る血管
  if (e.bloodshot > 0.03) {
    // 大きな眼ほど血管を多く描く（小さな眼では本数を抑えて負荷を下げる）
    const veins = Math.round((5 + e.bloodshot * 5) * clamp(e.w / 42, 0.6, 1.7));
    for (let v = 0; v < veins; v++) {
      const hv = hash(e.seed * 3.3 + v * 5.1);
      const a = hv * TAU;
      const pts: number[] = [];
      const r0 = e.w * 1.05;
      const r1 = e.irisR * (1.05 + 0.6 * hash(hv * 71));
      for (let k = 0; k <= 7; k++) {
        const t = k / 7;
        const r = lerp(r0, r1, t * e.bloodshot + (1 - e.bloodshot) * t * 0.5);
        const wob = fbm1(hv * 40 + t * 4, 2) * 0.32;
        pts.push(e.lookX * t + Math.cos(a + wob) * r, e.lookY * t + Math.sin(a + wob) * r * 0.9);
      }
      inkStroke(ctx, pts, {
        color: tone(PIGMENT.chi, 0.55 + 0.4 * e.bloodshot),
        width: Math.max(0.7, e.w * 0.035 * (0.6 + hv)),
        seed: e.seed + v,
        taperIn: 0.05,
        taperOut: 0.6,
        press: 0.2,
      });
    }
    const rg = ctx.createRadialGradient(e.lookX, e.lookY, e.irisR, e.lookX, e.lookY, e.w * 1.1);
    rg.addColorStop(0, tone(PIGMENT.chi, 0));
    rg.addColorStop(1, tone(PIGMENT.chi, 0.55 * e.bloodshot));
    ctx.fillStyle = rg;
    ctx.fillRect(-e.w * 1.1, -e.up * 1.4, e.w * 2.2, (e.up + e.low) * 1.5);
  }
  // 虹彩と瞳孔（ハイライトを持たない、光を返さない眼）
  const ig = ctx.createRadialGradient(e.lookX, e.lookY, e.pupilR * 0.6, e.lookX, e.lookY, e.irisR);
  ig.addColorStop(0, tone(mix(e.iris, PIGMENT.sumi, 0.5)));
  ig.addColorStop(0.72, tone(e.iris));
  ig.addColorStop(1, tone(PIGMENT.sumi));
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(e.lookX, e.lookY, e.irisR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tone(PIGMENT.sumi);
  ctx.beginPath();
  ctx.arc(e.lookX, e.lookY, e.pupilR, 0, TAU);
  ctx.fill();
  if (e.glint > 0.01) {
    ctx.fillStyle = tone(PIGMENT.gofun, 0.75 * e.glint);
    ctx.beginPath();
    ctx.arc(e.lookX, e.lookY, Math.max(0.6, e.pupilR * 0.22), 0, TAU);
    ctx.fill();
  }
  // 上瞼が落とす影
  const sh = ctx.createLinearGradient(0, -e.up, 0, e.low);
  sh.addColorStop(0, tone(PIGMENT.sumi, 0.6));
  sh.addColorStop(0.55, tone(PIGMENT.sumi, 0));
  ctx.fillStyle = sh;
  ctx.fillRect(-e.w * 1.1, -e.up * 1.3, e.w * 2.2, (e.up + e.low) * 1.4);
  ctx.restore();
  // 瞼の墨線：上は濃く太く、下は細く
  const ink = tone(PIGMENT.sumi);
  inkStroke(ctx, lidPoints(e.w * 1.06, e.up, true, 20), {
    color: ink,
    width: e.line,
    seed: e.seed + 0.5,
    taperIn: 0.08,
    taperOut: 0.3,
    press: 0.5,
  });
  inkStroke(ctx, lidPoints(e.w * 0.98, e.low, false, 16), {
    color: ink,
    width: e.line * 0.45,
    seed: e.seed + 0.9,
    taperIn: 0.25,
    taperOut: 0.45,
    press: 0.1,
  });
  ctx.restore();
}
/* ════════════ ひび割れ ════════════ */
interface Crack {
  pts: number[];
  width: number;
  delay: number;
}
/** 顔単位の座標で、枝分かれする亀裂群を一度だけ生成する。 */
function buildCracks(): Crack[] {
  const rnd = mulberry32(4419);
  const cracks: Crack[] = [];
  const origins: Array<[number, number, number]> = [
    [0.02, -0.4, -1.4],
    [-0.04, -0.38, 1.9],
    [0.31, -0.02, 1.2],
    [-0.33, -0.16, -2.2],
    [0.2, 0.5, 0.5],
    [-0.22, 0.52, 2.6],
    [0.5, 0.25, -0.6],
    [-0.55, 0.1, 3.4],
    [0.05, 0.2, 1.7],
    [-0.1, -0.7, 4.3],
    [0.4, -0.5, -1.0],
  ];
  const grow = (x0: number, y0: number, a0: number, segs: number, step: number, width: number, delay: number): void => {
    const pts = [x0, y0];
    let x = x0;
    let y = y0;
    let a = a0;
    for (let i = 0; i < segs; i++) {
      a += (rnd() - 0.5) * 1.5;
      const l = step * (0.5 + rnd());
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      pts.push(x, y);
      if (width > 0.007 && rnd() < 0.3) grow(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.8), 3 + Math.floor(rnd() * 5), step * 0.75, width * 0.55, delay + (i / segs) * 0.5);
    }
    cracks.push({ pts, width, delay });
  };
  origins.forEach(([x, y, a], i) => grow(x, y, a, 9 + Math.floor(rnd() * 6), 0.085, 0.011 + rnd() * 0.008, (i / origins.length) * 0.45));
  return cracks;
}
const CRACKS = buildCracks();
const crackBuf: number[] = [];
/** amount(0..1) に応じて亀裂が走っていく。呼び出し側で顔の輪郭にクリップしておくこと。 */
export function drawCracks(ctx: CanvasRenderingContext2D, s: number, amount: number, tone: Tone): void {
  if (amount <= 0.01) return;
  for (let c = 0; c < CRACKS.length; c++) {
    const crack = CRACKS[c];
    const local = clamp((amount - crack.delay * 0.8) / 0.4);
    if (local <= 0) continue;
    const n = crack.pts.length / 2;
    const shown = Math.max(2, Math.ceil(n * local));
    crackBuf.length = 0;
    for (let i = 0; i < shown; i++) crackBuf.push(crack.pts[i * 2] * s, crack.pts[i * 2 + 1] * s);
    // 裂け目の奥に滲む血の色
    inkStroke(ctx, crackBuf, {
      color: tone(PIGMENT.chi, 0.5 * amount),
      width: crack.width * s * 3.2,
      seed: c * 3.1,
      taperIn: 0.04,
      taperOut: 0.5,
      wobble: 0.5,
    });
    inkStroke(ctx, crackBuf, {
      color: tone(PIGMENT.sumi),
      width: crack.width * s * 1.25,
      seed: c * 7.7,
      taperIn: 0.03,
      taperOut: 0.6,
      wobble: 0.6,
      press: 0.6,
    });
  }
}
/* ════════════ 口 ════════════ */
export interface MouthSpec {
  /** 顔スケール（px） */
  s: number;
  /** 0=閉じた慈悲の唇, 1=耳まで裂けた顎 */
  open: number;
  /** 左右の口角の非対称（-1..1） */
  skew: number;
  time: number;
}
/** 上下の唇の曲線（顔単位）。左右で口角の高さが異なる。 */
function mouthCurves(m: MouthSpec): { cornerX: number; upper: (x: number) => number; lower: (x: number) => number } {
  const o = m.open;
  const cornerX = lerp(0.155, 0.61, o);
  const cornerY = (x: number): number => lerp(0.538, 0.385, o) + m.skew * 0.07 * o * Math.sign(x);
  const upMid = lerp(0.528, 0.565, o);
  const lowMid = lerp(0.534, 0.99, o);
  const upper = (x: number): number => {
    const k = clamp(Math.abs(x) / cornerX);
    // 中央の人中でわずかに下がる弓形
    const bow = 0.012 * (1 - o * 0.5) * Math.exp(-Math.pow(k / 0.22, 2));
    return lerp(upMid, cornerY(x), Math.pow(k, 1.9)) + bow;
  };
  const lower = (x: number): number => {
    const k = clamp(Math.abs(x) / cornerX);
    return lerp(lowMid, cornerY(x), Math.pow(k, 2.4));
  };
  return { cornerX, upper, lower };
}
const mouthBuf: number[] = [];
export function drawMouth(ctx: CanvasRenderingContext2D, m: MouthSpec, tone: Tone): void {
  const { s, open: o } = m;
  const { cornerX, upper, lower } = mouthCurves(m);
  const STEPS = 34;
  const sample = (fn: (x: number) => number, scaleX = 1): number[] => {
    mouthBuf.length = 0;
    for (let i = 0; i <= STEPS; i++) {
      const x = lerp(-cornerX, cornerX, i / STEPS) * scaleX;
      mouthBuf.push(x * s, fn(x) * s);
    }
    return mouthBuf;
  };
  // ── 慈悲の唇（閉じているあいだだけ見える） ──
  const calm = 1 - smoothstep(0, 0.3, o);
  if (calm > 0.01) {
    ctx.globalAlpha = calm;
    ctx.fillStyle = tone(mix(PIGMENT.bengara, PIGMENT.kinKage, 0.35), 0.8);
    ctx.beginPath();
    // 上唇
    ctx.moveTo(-0.155 * s, 0.538 * s);
    ctx.bezierCurveTo(-0.09 * s, 0.492 * s, -0.035 * s, 0.488 * s, 0, 0.506 * s);
    ctx.bezierCurveTo(0.035 * s, 0.488 * s, 0.09 * s, 0.492 * s, 0.155 * s, 0.538 * s);
    ctx.bezierCurveTo(0.08 * s, 0.53 * s, -0.08 * s, 0.53 * s, -0.155 * s, 0.538 * s);
    // 下唇
    ctx.moveTo(-0.14 * s, 0.542 * s);
    ctx.bezierCurveTo(-0.07 * s, 0.61 * s, 0.07 * s, 0.61 * s, 0.14 * s, 0.542 * s);
    ctx.bezierCurveTo(0.06 * s, 0.538 * s, -0.06 * s, 0.538 * s, -0.14 * s, 0.542 * s);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // ── 口腔 ──
  if (o > 0.02) {
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, sample(upper), false);
    for (let i = STEPS; i >= 0; i--) {
      const x = lerp(-cornerX, cornerX, i / STEPS);
      ctx.lineTo(x * s, lower(x) * s);
    }
    ctx.closePath();
    ctx.fillStyle = tone(PIGMENT.sumi);
    ctx.fill();
    ctx.clip();
    // 喉の奥の暗い赤
    const tg = ctx.createRadialGradient(0, lerp(0.56, 0.88, o) * s, 0, 0, lerp(0.56, 0.8, o) * s, 0.42 * s * o + 1);
    tg.addColorStop(0, tone(PIGMENT.sumi));
    tg.addColorStop(0.45, tone(PIGMENT.enji, 0.9));
    tg.addColorStop(1, tone(PIGMENT.chi, 0));
    ctx.fillStyle = tg;
    ctx.fillRect(-cornerX * s, 0.3 * s, cornerX * 2 * s, 0.8 * s);
    // 歯茎
    inkStroke(ctx, sample((x) => upper(x) + 0.012 * o), { color: tone(PIGMENT.chi), width: 0.07 * s * o, seed: 61, taperIn: 0.02, taperOut: 0.04, wobble: 0.2, press: 0 });
    inkStroke(ctx, sample((x) => lower(x) - 0.012 * o), { color: tone(PIGMENT.enji), width: 0.06 * s * o, seed: 62, taperIn: 0.02, taperOut: 0.04, wobble: 0.2, press: 0 });
    // 牙：上顎は下向き、下顎は上向き。犬歯は異様に長い。
    const bone = tone(mix(PIGMENT.torinoko, PIGMENT.oudo, 0.25));
    const boneShade = tone(mix(PIGMENT.oudo, PIGMENT.enji, 0.5), 0.7);
    const ink = tone(PIGMENT.sumi);
    const rows: Array<[(x: number) => number, number, number, number]> = [
      [upper, 1, 19, 11],
      [lower, -1, 15, 23],
    ];
    for (const [curve, dir, count, seed] of rows) {
      const span = (cornerX * 1.9) / count;
      for (let i = 0; i < count; i++) {
        const hx = hash(seed * 7.1 + i * 3.3);
        const x = lerp(-cornerX * 0.95, cornerX * 0.95, (i + 0.5) / count);
        const k = Math.abs(x) / cornerX;
        const fang = dir > 0 ? Math.exp(-Math.pow((k - 0.36) / 0.07, 2)) : Math.exp(-Math.pow((k - 0.5) / 0.08, 2));
        const len = o * (0.05 + 0.045 * hx + fang * (dir > 0 ? 0.17 : 0.23)) * (1 - 0.5 * Math.pow(k, 4));
        const bw = span * (0.8 + 0.3 * hx + fang * 0.5);
        const lean = (hx - 0.5) * span * 0.6 * o;
        const xl = x - bw / 2;
        const xr = x + bw / 2;
        const base = dir > 0 ? 0.004 : -0.004;
        const tipX = (x + lean) * s;
        const tipY = (curve(x) + dir * len) * s;
        ctx.fillStyle = bone;
        ctx.beginPath();
        ctx.moveTo(xl * s, (curve(xl) + base) * s);
        ctx.quadraticCurveTo((x - bw * 0.3) * s, (curve(x) + dir * len * 0.6) * s, tipX, tipY);
        ctx.quadraticCurveTo((x + bw * 0.42) * s, (curve(x) + dir * len * 0.45) * s, xr * s, (curve(xr) + base) * s);
        ctx.closePath();
        ctx.fill();
        // 歯の陰と輪郭
        ctx.fillStyle = boneShade;
        ctx.beginPath();
        ctx.moveTo(x * s, (curve(x) + base) * s);
        ctx.quadraticCurveTo((x + bw * 0.25) * s, (curve(x) + dir * len * 0.5) * s, tipX, tipY);
        ctx.quadraticCurveTo((x + bw * 0.42) * s, (curve(x) + dir * len * 0.45) * s, xr * s, (curve(xr) + base) * s);
        ctx.closePath();
        ctx.fill();
        inkStroke(ctx, [xl * s, (curve(xl) + base) * s, (x - bw * 0.22) * s, (curve(x) + dir * len * 0.55) * s, tipX, tipY], {
          color: ink,
          width: Math.max(0.8, 0.008 * s),
          seed: seed + i,
          taperIn: 0.1,
          taperOut: 0.5,
        });
      }
    }
    ctx.restore();
    // 唇の縁：太く荒い墨線
    inkStroke(ctx, sample(upper, 1.02), { color: ink_(tone), width: 0.03 * s * (0.4 + o), seed: 71, taperIn: 0.06, taperOut: 0.12, wobble: 0.45, dry: 0.5 });
    inkStroke(ctx, sample(lower, 1.02), { color: ink_(tone), width: 0.034 * s * (0.4 + o), seed: 72, taperIn: 0.06, taperOut: 0.12, wobble: 0.45, dry: 0.5 });
    // 口角の裂け目：耳へ向かって肉が割れる
    const rip = smoothstep(0.35, 1, o);
    if (rip > 0.01) {
      for (const side of [-1, 1]) {
        const cy = upper(side * cornerX);
        for (let r = 0; r < 3; r++) {
          const a = -0.55 + r * 0.42 + m.skew * 0.2 * side;
          const len = (0.1 + 0.07 * hash(r * 3.7 + side)) * rip;
          const pts: number[] = [];
          for (let k = 0; k <= 5; k++) {
            const t = k / 5;
            const jag = (hash(r * 11 + k * 3.1 + side * 5) - 0.5) * 0.025;
            pts.push(side * (cornerX + Math.cos(a) * len * t) * s, (cy + Math.sin(a) * len * t + jag * t) * s);
          }
          inkStroke(ctx, pts, { color: tone(PIGMENT.chi, 0.85), width: 0.03 * s * rip, seed: 80 + r + side, taperIn: 0.05, taperOut: 0.7, wobble: 0.5 });
          inkStroke(ctx, pts, { color: ink_(tone), width: 0.013 * s * rip, seed: 90 + r + side, taperIn: 0.05, taperOut: 0.7, wobble: 0.5 });
        }
      }
    }
  } else {
    // 閉じた唇の合わせ目：口角がわずかに上がる古拙の微笑
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const x = lerp(-0.17, 0.17, i / 20);
      const k = Math.abs(x) / 0.17;
      pts.push(x * s, (0.538 + 0.004 * Math.cos(k * Math.PI * 2) - 0.012 * Math.pow(k, 3)) * s);
    }
    inkStroke(ctx, pts, { color: ink_(tone), width: 0.011 * s, seed: 70, taperIn: 0.18, taperOut: 0.18, wobble: 0.1, press: 0 });
  }
}
const ink_ = (tone: Tone): string => tone(PIGMENT.sumi);
