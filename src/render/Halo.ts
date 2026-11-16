/**
 * render/Halo — 後光。
 * 静：定規で引いたように等間隔の放射光と蓮弁の輪（金泥）。
 * 動：朱と漆黒の火焔光背へ反転し、輪の上に無数の眼が開く。
 * 原点＝後光の中心（呼び出し側で translate 済み）。
 */
import { TAU, hash, smoothstep, snoise1 } from '../core/math';
import { PIGMENT, mix, type RGB } from '../core/palette';
import { arcPoints, inkStroke } from './Brush';
import { drawEye, type Tone } from './DeityFeatures';
import { drawFlame } from './Flames';
export interface HaloParams {
  /** 顔スケール（px） */
  s: number;
  time: number;
  /** 0=黄金, 1=血と闇 */
  morph: number;
  /** 火焔の勢い 0..1 */
  fire: number;
  /** 輪の眼の開き 0..1 */
  eyes: number;
  /** 放射光が届くべき半径（px） */
  reach: number;
  tone: Tone;
  /** 退色を適用した RGB を返す（炎パレット用） */
  grade: (c: RGB) => RGB;
}
const RAYS = 72;
const PETALS = 36;
const RING_EYES = 12;
export function drawHalo(ctx: CanvasRenderingContext2D, p: HaloParams): void {
  const { s, tone, morph: m, time } = p;
  const rIn = 1.27 * s;
  const rOut = 1.43 * s;
  const ink = tone(PIGMENT.sumi);
  // ── 漆黒の炎（最背面） ──
  if (p.fire > 0.01) {
    const pal = { outer: p.grade(PIGMENT.sumi), mid: p.grade(PIGMENT.susu), core: p.grade(PIGMENT.enji), ink: p.grade(PIGMENT.chi) };
    for (let i = 0; i < 18; i++) {
      const h = hash(i * 5.3 + 2.1);
      const a = (i / 18) * TAU + (h - 0.5) * 0.2;
      drawFlame(ctx, Math.cos(a) * rOut * 0.98, Math.sin(a) * rOut * 0.98, a + (h - 0.5) * 0.5, (0.75 + 0.7 * h) * s * p.fire, 0.34 * s, time, 100 + i, pal, 0.95);
    }
  }
  // ── 放射光：長短が交互に並ぶ刃 ──
  const jitter = m * 0.035;
  ctx.fillStyle = tone(mix(PIGMENT.gofun, PIGMENT.chi, m), 0.5 + 0.3 * m);
  ctx.beginPath();
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * TAU + jitter * Math.sin(time * 9 + i * 1.7);
    const half = (TAU / RAYS) * 0.27;
    const far = i % 2 === 0 ? p.reach : 2.25 * s * (1 + m * 0.2 * Math.sin(time * 13 + i));
    ctx.moveTo(Math.cos(a - half) * rOut, Math.sin(a - half) * rOut);
    ctx.lineTo(Math.cos(a) * far, Math.sin(a) * far);
    ctx.lineTo(Math.cos(a + half) * rOut, Math.sin(a + half) * rOut);
  }
  ctx.fill();
  // 刃の間に落ちる細い墨の筋
  ctx.fillStyle = tone(mix(PIGMENT.kinKage, PIGMENT.sumi, m), 0.4);
  ctx.beginPath();
  for (let i = 0; i < RAYS; i++) {
    const a = ((i + 0.5) / RAYS) * TAU;
    const half = (TAU / RAYS) * 0.035;
    ctx.moveTo(Math.cos(a - half) * rOut, Math.sin(a - half) * rOut);
    ctx.lineTo(Math.cos(a) * 1.95 * s, Math.sin(a) * 1.95 * s);
    ctx.lineTo(Math.cos(a + half) * rOut, Math.sin(a + half) * rOut);
  }
  ctx.fill();
  // ── 蓮弁の輪 ──
  ctx.fillStyle = tone(mix(PIGMENT.kinKage, PIGMENT.sumi, m));
  ctx.beginPath();
  ctx.arc(0, 0, rOut, 0, TAU);
  ctx.arc(0, 0, rIn, 0, TAU, true);
  ctx.fill();
  // ── 内円 ──
  const dg = ctx.createRadialGradient(0, 0, 0.7 * s, 0, 0, rIn);
  dg.addColorStop(0, tone(mix(PIGMENT.gofun, PIGMENT.shu, m)));
  dg.addColorStop(0.6, tone(mix(PIGMENT.kinpaku, PIGMENT.chi, m)));
  dg.addColorStop(1, tone(mix(PIGMENT.kin, PIGMENT.enji, m)));
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.arc(0, 0, rIn, 0, TAU);
  ctx.fill();
  // 内円の細い放射線（先細りの楔）
  ctx.fillStyle = tone(mix(PIGMENT.kinKage, PIGMENT.sumi, m), 0.42);
  ctx.beginPath();
  for (let i = 0; i < 144; i++) {
    const a = (i / 144) * TAU;
    const half = (TAU / 144) * (i % 3 === 0 ? 0.16 : 0.07);
    const r0 = (i % 3 === 0 ? 0.86 : 1.0) * s;
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a - half) * rIn, Math.sin(a - half) * rIn);
    ctx.lineTo(Math.cos(a + half) * rIn, Math.sin(a + half) * rIn);
  }
  ctx.fill();
  // 輪の墨線と蓮弁（左右を同一の筆致で鏡写しに引く）
  const petalInk = tone(mix(PIGMENT.sumi, PIGMENT.chi, m * 0.6));
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    for (const [r, w, seed] of [
      [rIn, 0.02, 3],
      [rOut, 0.026, 5],
      [rIn + (rOut - rIn) * 0.5, 0.007, 7],
    ] as const) {
      inkStroke(ctx, arcPoints(0, 0, r, -Math.PI / 2, Math.PI / 2, 48), {
        color: ink,
        width: w * s,
        seed,
        taperIn: 0.02,
        taperOut: 0.04,
        wobble: 0.22,
        press: 0.15,
        dry: 0.35,
      });
    }
    for (let i = 0; i < PETALS / 2; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / PETALS) * TAU;
      const half = (TAU / PETALS) * 0.46;
      const pts: number[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const aa = a - half + half * 2 * t;
        const rr = rIn + (rOut - rIn) * (0.12 + 0.76 * Math.pow(Math.sin(Math.PI * t), 0.6));
        pts.push(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      inkStroke(ctx, pts, { color: petalInk, width: 0.011 * s, seed: 20 + i, taperIn: 0.12, taperOut: 0.3, press: 0.3 });
    }
    ctx.restore();
  }
  // ── 朱の火焔 ──
  if (p.fire > 0.01) {
    const pal = { outer: p.grade(PIGMENT.enji), mid: p.grade(PIGMENT.shu), core: p.grade(PIGMENT.oudo), ink: p.grade(PIGMENT.sumi) };
    for (let i = 0; i < 30; i++) {
      const h = hash(i * 3.7 + 9.4);
      const a = ((i + 0.5 * h) / 30) * TAU;
      drawFlame(ctx, Math.cos(a) * rIn * 1.04, Math.sin(a) * rIn * 1.04, a + (h - 0.5) * 0.7, (0.4 + 0.6 * h) * s * p.fire, (0.16 + 0.1 * h) * s, time, 200 + i, pal);
    }
  }
  // ── 輪に開く無数の眼 ──
  if (p.eyes > 0.01) {
    const lock = smoothstep(0.7, 1, p.eyes);
    for (let i = 0; i < RING_EYES; i++) {
      const order = hash(i * 7.9 + 1.3);
      const open = smoothstep(order * 0.6, order * 0.6 + 0.3, p.eyes);
      if (open <= 0.01) continue;
      const a = ((i + 0.5) / RING_EYES) * TAU;
      const r = (rIn + rOut) * 0.5;
      const w = (0.085 + 0.02 * order) * s;
      const blink = 0.85 + 0.15 * Math.sin(time * 3.1 + i * 2.2);
      drawEye(
        ctx,
        {
          x: Math.cos(a) * r,
          y: Math.sin(a) * r,
          w,
          up: w * 0.62 * open * blink,
          low: w * 0.5 * open * blink,
          tilt: a + Math.PI / 2,
          irisR: w * 0.36,
          pupilR: w * 0.1,
          lookX: snoise1(time * 2.7 + i * 7.3) * w * 0.45 * (1 - lock),
          lookY: snoise1(time * 2.1 + i * 3.9) * w * 0.2 * (1 - lock),
          bloodshot: 1,
          seed: 300 + i,
          sclera: PIGMENT.kinari,
          iris: PIGMENT.kinpaku,
          line: 0.02 * s,
          glint: lock,
        },
        tone,
      );
    }
  }
}
