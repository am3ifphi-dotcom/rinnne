/**
 * render/Deity — 仏、そして鬼神。
 *
 * 顔中心を原点とする「顔単位」（顔の半高 ≒ 1）で造形を定義し、s 倍して px に落とす。
 * 左右は変換行列の反転（scale(-1,1)）と同一シードの筆致で描くため、
 * morph=0 では寸分違わぬ左右対称になる。morph が進むと side ごとの乱数で
 * 目・眉・角・顎が非対称に歪み、ひび割れ・牙・無数の眼が現れる。
 */
import { TAU, catmullRom, hash, lerp, smoothstep, snoise1 } from '../core/math';
import { PIGMENT, css, desaturate, mix, type RGB } from '../core/palette';
import { arcPoints, inkStroke, spiralPoints, tracePath } from './Brush';
import { drawCracks, drawEye, drawMouth, type Tone } from './DeityFeatures';
import { drawHalo } from './Halo';
export interface DeityParams {
  cx: number;
  cy: number;
  /** 顔スケール（px / 顔単位） */
  s: number;
  time: number;
  /** 顕現（瞼がわずかに上がる） 0..1 */
  reveal: number;
  /** 瞳の焦点がこちらへ合う 0..1 */
  gaze: number;
  /** 退色 0..1 */
  desat: number;
  /** 仏→鬼神 0..1 */
  morph: number;
  /** 後光が届くべき半径（px） */
  reach: number;
}
/* ───── 静的な造形（顔単位・右半分） ───── */
const HEAD = [0, -1.02, 0.36, -0.99, 0.62, -0.8, 0.76, -0.42, 0.79, 0, 0.74, 0.38, 0.6, 0.7, 0.36, 0.92, 0.14, 1.0, 0, 1.01];
const HAIR_IN = [0, -0.615, 0.2, -0.63, 0.42, -0.59, 0.6, -0.48, 0.715, -0.33, 0.775, -0.2];
const HAIR_OUT = [0.815, -0.3, 0.835, -0.55, 0.75, -0.82, 0.58, -1.02, 0.4, -1.12, 0.33, -1.2, 0.36, -1.38, 0.27, -1.54, 0.12, -1.62, 0, -1.635];
const HAIR_POLY = [...catmullRom(HAIR_IN, 5), ...catmullRom(HAIR_OUT, 5)];
const EAR = [0.74, -0.3, 0.9, -0.36, 0.985, -0.2, 0.975, 0.05, 0.93, 0.3, 0.925, 0.52, 0.87, 0.7, 0.79, 0.66, 0.75, 0.45];
const BROW_CALM = [0.075, -0.262, 0.2, -0.345, 0.36, -0.375, 0.52, -0.35, 0.67, -0.275];
const BROW_WRATH = [0.05, -0.15, 0.17, -0.27, 0.34, -0.4, 0.52, -0.5, 0.7, -0.6];
const NOSE_CALM = [0.078, -0.25, 0.058, -0.08, 0.07, 0.1, 0.125, 0.235, 0.135, 0.295, 0.085, 0.335, 0, 0.342];
const NOSE_WRATH = [0.06, -0.2, 0.07, -0.06, 0.09, 0.08, 0.19, 0.2, 0.215, 0.28, 0.11, 0.335, 0, 0.35];
const SHOULDER = [0.46, 1.18, 0.7, 1.24, 1.1, 1.3, 1.7, 1.5, 2.5, 1.9, 3.6, 2.7];
/** 顔面に開く眼 [x, y, 傾き, 半幅] */
const FACE_EYES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.25, -0.5, -0.5, 0.06],
  [0.52, 0.2, 0.55, 0.066],
  [0.63, -0.27, -1.25, 0.05],
  [0.33, 0.78, 0.35, 0.05],
  [0.5, -0.72, -0.9, 0.045],
];
function inPoly(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 螺髪の中心（顔単位）。煉瓦積みの格子を髪の領域で切り抜く。 */
const CURLS: number[] = (() => {
  const out: number[] = [];
  let row = 0;
  for (let y = -1.6; y < -0.2; y += 0.083, row++) {
    for (let x = row % 2 ? 0 : 0.049; x < 0.86; x += 0.098) {
      if (inPoly(x + 0.012, y, HAIR_POLY) || (x === 0 && inPoly(0.01, y, HAIR_POLY))) out.push(x, y);
    }
  }
  return out;
})();
const scaled = (unit: number[], s: number): number[] => unit.map((v) => v * s);
const blend = (a: number[], b: number[], t: number): number[] => a.map((v, i) => lerp(v, b[i], t));
function headHalf(s: number, jaw: number, skew: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < HEAD.length; i += 2) {
    let x = HEAD[i];
    let y = HEAD[i + 1];
    if (y > 0.25) {
      const k = (y - 0.25) / 0.76;
      y += jaw * 0.25 * Math.pow(k, 1.2);
      x *= 1 - jaw * 0.07 * k;
    }
    x *= 1 + skew * 0.04 * (y > 0 ? 1 : 0.3);
    pts.push(x, y);
  }
  return scaled(catmullRom(pts, 6), s);
}
export function drawDeity(ctx: CanvasRenderingContext2D, p: DeityParams): void {
  const { s, time, morph: m } = p;
  const grade = (c: RGB): RGB => desaturate(c, p.desat);
  const tone: Tone = (c, a = 1) => css(grade(c), a);
  // モーフの各段階
  const eo = smoothstep(0.04, 0.5, m); // 開眼
  const mo = smoothstep(0.18, 0.85, m); // 裂口
  const crack = smoothstep(0, 0.75, m);
  const extra = smoothstep(0.32, 1, m);
  const fire = smoothstep(0.02, 0.6, m);
  const horn = smoothstep(0.4, 0.95, m);
  /** side ごとに異なる歪み（morph に比例） */
  const asy = (key: number, side: number): number => m * (hash(key * 3.1 + (side > 0 ? 0.3 : 41.7)) * 2 - 1);
  const skin = mix(PIGMENT.kinpaku, PIGMENT.bengara, m);
  const shadow = mix(PIGMENT.kinKage, PIGMENT.sumi, 0.15 + 0.85 * m);
  const flesh = mix(skin, shadow, 0.38);
  const ink = tone(PIGMENT.sumi);
  const lineW = (0.017 + 0.012 * m) * s;
  ctx.save();
  ctx.translate(p.cx, p.cy);
  // ══ 後光 ══
  ctx.save();
  ctx.translate(0, -0.15 * s);
  drawHalo(ctx, { s, time, morph: m, fire, eyes: extra, reach: p.reach, tone, grade });
  ctx.restore();
  // ══ 肩・衣・首・耳（背面） ══
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    const shoulder = scaled(catmullRom(SHOULDER, 6), s);
    ctx.fillStyle = tone(mix(mix(PIGMENT.bengara, PIGMENT.kinKage, 0.45), PIGMENT.sumi, m * 0.85));
    ctx.beginPath();
    tracePath(ctx, shoulder, false);
    ctx.lineTo(3.6 * s, 4 * s);
    ctx.lineTo(0, 4 * s);
    ctx.lineTo(0, 1.25 * s);
    ctx.closePath();
    ctx.fill();
    // 胸元
    ctx.fillStyle = tone(flesh);
    ctx.beginPath();
    tracePath(ctx, scaled([0, 1.28, 0.5, 1.22, 0.43, 1.5, 0.21, 1.86, 0, 2.12], s));
    ctx.fill();
    inkStroke(ctx, shoulder, { color: ink, width: lineW * 1.5, seed: 11, taperIn: 0.03, taperOut: 0.2, dry: 0.5 });
    inkStroke(ctx, scaled(catmullRom([0.5, 1.22, 0.44, 1.5, 0.22, 1.86, 0, 2.13], 5), s), { color: ink, width: lineW * 1.6, seed: 12, taperIn: 0.05, taperOut: 0.25, dry: 0.4 });
    for (let i = 0; i < 6; i++) {
      const fold = catmullRom([0.6 + 0.13 * i, 1.3 + 0.05 * i, 0.85 + 0.25 * i, 1.7 + 0.12 * i, 1.25 + 0.36 * i, 2.3 + 0.24 * i], 6);
      inkStroke(ctx, scaled(fold, s), { color: ink, width: lineW * (0.7 + 0.12 * i), seed: 13 + i, taperIn: 0.08, taperOut: 0.6, dry: 0.6 });
    }
    // 首と三道
    ctx.fillStyle = tone(flesh);
    ctx.beginPath();
    tracePath(ctx, scaled([0, 0.8, 0.5, 0.7, 0.5, 1.0, 0.56, 1.26, 0, 1.34], s));
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const y0 = 1.07 + 0.085 * k + mo * 0.1;
      inkStroke(ctx, scaled(catmullRom([0, y0 + 0.03, 0.2, y0 + 0.022, 0.4, y0 - 0.015, 0.52, y0 - 0.05], 5), s), { color: ink, width: lineW * 0.8, seed: 21 + k, taperIn: 0.001, taperOut: 0.45, press: 0, wobble: 0.15 });
    }
    // 耳：長く垂れた耳朶。変貌すると先が尖る。
    const ear = EAR.slice();
    ear[2] = lerp(0.9, 1.06, m);
    ear[3] = lerp(-0.36, -0.7, m) + asy(5, side) * 0.08;
    const earPts = scaled(catmullRom(ear, 5, true), s);
    ctx.fillStyle = tone(flesh);
    ctx.beginPath();
    tracePath(ctx, earPts);
    ctx.fill();
    inkStroke(ctx, earPts, { color: ink, width: lineW, seed: 31, taperIn: 0.04, taperOut: 0.15, dry: 0.3 });
    inkStroke(ctx, scaled(catmullRom([0.87, -0.25, 0.93, -0.1, 0.905, 0.1, 0.865, 0.28], 5), s), { color: ink, width: lineW * 0.7, seed: 32, taperIn: 0.1, taperOut: 0.5 });
    inkStroke(ctx, scaled([0.862, 0.36, 0.853, 0.5, 0.838, 0.6], s), { color: ink, width: lineW * 1.3, seed: 33, taperIn: 0.15, taperOut: 0.4 });
    ctx.restore();
  }
  // ══ 頭部 ══
  const right = headHalf(s, mo, asy(1, 1));
  const left = headHalf(s, mo, asy(1, -1));
  const headPath = (): void => {
    ctx.beginPath();
    tracePath(ctx, right, false);
    for (let i = left.length / 2 - 1; i >= 0; i--) ctx.lineTo(-left[i * 2], left[i * 2 + 1]);
    ctx.closePath();
  };
  headPath();
  ctx.fillStyle = tone(skin);
  ctx.fill();
  const hg = ctx.createRadialGradient(0, -0.1 * s, 0.22 * s, 0, 0.05 * s, 1.2 * s);
  hg.addColorStop(0, tone(shadow, 0));
  hg.addColorStop(0.6, tone(shadow, 0.22 + 0.2 * m));
  hg.addColorStop(1, tone(shadow, 0.72));
  ctx.fillStyle = hg;
  ctx.fill();
  // ひび割れ（顔の内側だけに走る）
  if (crack > 0.01) {
    ctx.save();
    headPath();
    ctx.clip();
    drawCracks(ctx, s, crack, tone);
    ctx.restore();
  }
  // ══ 髪・角・眉・眼・鼻（左右） ══
  const hairBase = mix(PIGMENT.konjou, PIGMENT.sumi, 0.3 + 0.6 * m);
  const curlInk = tone(mix(mix(PIGMENT.gunjou, PIGMENT.aiNezu, 0.55), PIGMENT.chi, m * 0.45));
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    // 角：生え際を突き破って伸びる（髪の上に重ねるため、描画は後段で呼ぶ）
    const drawHorn = (): void => {
      if (horn <= 0.01) return;
      const hLen = horn * (1 + 0.3 * asy(7, side));
      const c: number[] = [];
      const lft: number[] = [];
      const rgt: number[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = (k / 12) * hLen;
        const u = 1 - t;
        const x = (u * u * 0.37 + 2 * u * t * 0.6 + t * t * 0.86) * s;
        const y = (u * u * -0.6 + 2 * u * t * -0.78 + t * t * -1.2) * s;
        c.push(x, y);
      }
      for (let k = 0; k <= 12; k++) {
        const k0 = Math.max(0, k - 1);
        const k1 = Math.min(12, k + 1);
        const tx = c[k1 * 2] - c[k0 * 2];
        const ty = c[k1 * 2 + 1] - c[k0 * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        const w = 0.085 * s * (1 - (k / 12) * 0.96);
        lft.push(c[k * 2] - (ty / tl) * w, c[k * 2 + 1] + (tx / tl) * w);
        rgt.push(c[k * 2] + (ty / tl) * w, c[k * 2 + 1] - (tx / tl) * w);
      }
      ctx.fillStyle = tone(mix(PIGMENT.torinoko, PIGMENT.oudo, 0.35));
      ctx.beginPath();
      tracePath(ctx, lft, false);
      for (let k = 12; k >= 0; k--) ctx.lineTo(rgt[k * 2], rgt[k * 2 + 1]);
      ctx.closePath();
      ctx.fill();
      inkStroke(ctx, lft, { color: ink, width: lineW * 1.2, seed: 41, taperIn: 0.05, taperOut: 0.3, dry: 0.4 });
      inkStroke(ctx, rgt, { color: ink, width: lineW * 1.2, seed: 42, taperIn: 0.05, taperOut: 0.3, dry: 0.4 });
      for (let k = 2; k < 11; k += 2) {
        inkStroke(ctx, [lft[k * 2], lft[k * 2 + 1], c[k * 2], c[k * 2 + 1] - 0.02 * s, rgt[k * 2], rgt[k * 2 + 1]], { color: ink, width: lineW * 0.6, seed: 43 + k, taperIn: 0.15, taperOut: 0.5 });
      }
      // 角の根元で裂けた皮膚
      for (let k = 0; k < 4; k++) {
        const a = -0.4 + k * 0.75;
        inkStroke(ctx, [c[0], c[1], c[0] + Math.cos(a) * 0.05 * s, c[1] + Math.sin(a) * 0.05 * s + 0.02 * s, c[0] + Math.cos(a + 0.4) * 0.11 * s, c[1] + Math.sin(a + 0.4) * 0.11 * s + 0.05 * s], { color: tone(PIGMENT.chi, 0.9), width: 0.022 * s * horn, seed: 47 + k, taperIn: 0.05, taperOut: 0.7 });
      }
    };
    // 髪
    ctx.fillStyle = tone(hairBase);
    ctx.beginPath();
    tracePath(ctx, scaled(HAIR_POLY, s));
    ctx.fill();
    for (let i = 0; i < CURLS.length; i += 2) {
      const crawl = m * 0.012 * s;
      const x = CURLS[i] * s + crawl * Math.sin(time * 6.3 + i * 1.9 + side);
      const y = CURLS[i + 1] * s + crawl * Math.cos(time * 5.1 + i * 2.3);
      const r0 = 0.04 * s * (1 + 0.5 * m * hash(i * 1.7 + side));
      inkStroke(ctx, spiralPoints(x, y, r0, r0 * 0.14, 0.4, 1.35, 11), { color: curlInk, width: 0.013 * s, seed: 50 + (i % 14), taperIn: 0.1, taperOut: 0.4, press: 0.3 });
    }
    inkStroke(ctx, scaled(catmullRom(HAIR_OUT, 5), s), { color: ink, width: lineW * 1.2, seed: 61, taperIn: 0.04, taperOut: 0.08, wobble: 0.4, dry: 0.4 });
    inkStroke(ctx, scaled(catmullRom(HAIR_IN, 5), s), { color: ink, width: lineW * 0.9, seed: 62, taperIn: 0.001, taperOut: 0.2, press: 0, wobble: 0.2 });
    drawHorn();
    // 隈取り：仏画の淡い暈しで面の起伏を与える（静のあいだだけ）
    const wash = (x: number, y: number, r: number, c: RGB, a: number): void => {
      const wg = ctx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      wg.addColorStop(0, tone(c, a));
      wg.addColorStop(1, tone(c, 0));
      ctx.fillStyle = wg;
      ctx.fillRect((x - r) * s, (y - r) * s, 2 * r * s, 2 * r * s);
    };
    if (eo < 0.98) {
      const calm = 1 - eo;
      wash(0.33, -0.21, 0.21, PIGMENT.kinKage, 0.42 * calm); // 眉の下
      wash(0.135, 0.16, 0.14, PIGMENT.kinKage, 0.38 * calm); // 鼻の脇
      wash(0.52, 0.45, 0.25, PIGMENT.kinKage, 0.22 * calm); // 頬の落ち
      wash(0.04, 0.4, 0.09, PIGMENT.kinKage, 0.3 * calm); // 鼻の下
      wash(0.03, 0.655, 0.12, PIGMENT.kinKage, 0.32 * calm); // 下唇の下
      wash(0.34, 0.2, 0.2, PIGMENT.gofun, 0.2 * calm); // 頬の照り
      wash(0.1, -0.5, 0.3, PIGMENT.gofun, 0.14 * calm); // 額の照り
    }
    // 眉：慈悲の弧から、逆立つ憤怒の眉へ
    const brow = blend(BROW_CALM, BROW_WRATH, eo);
    brow[1] += asy(9, side) * 0.05;
    const browPts = scaled(catmullRom(brow, 6), s);
    inkStroke(ctx, browPts, { color: ink, width: lerp(0.02, 0.1, eo) * s, seed: 71, taperIn: 0.06, taperOut: 0.55, press: 0.35, dry: eo * 0.7 });
    if (eo > 0.05) {
      for (let k = 0; k < 7; k++) {
        const bi = Math.floor(lerp(4, browPts.length / 2 - 3, k / 6)) * 2;
        const len = (0.05 + 0.07 * hash(k * 3.3)) * eo * s;
        inkStroke(ctx, [browPts[bi], browPts[bi + 1], browPts[bi] + len * 0.45, browPts[bi + 1] - len * 0.6, browPts[bi] + len * 0.6, browPts[bi + 1] - len * 1.35], { color: ink, width: 0.03 * s * eo, seed: 72 + k, taperIn: 0.05, taperOut: 0.8 });
      }
    }
    // 眼窩の陰
    const ex = 0.315 * s;
    const ey = (-0.095 + asy(13, side) * 0.035) * s;
    if (eo > 0.01) {
      const og = ctx.createRadialGradient(ex, ey, 0.08 * s, ex, ey, 0.36 * s);
      og.addColorStop(0, tone(PIGMENT.sumi, 0.62 * eo));
      og.addColorStop(1, tone(PIGMENT.sumi, 0));
      ctx.fillStyle = og;
      ctx.fillRect(ex - 0.4 * s, ey - 0.4 * s, 0.8 * s, 0.8 * s);
    }
    // 眼：半眼の奥の冷たい瞳 → 血走って見開かれた眼
    const big = 1 + 0.28 * asy(15, side);
    const w = lerp(0.2, 0.215, eo) * s * big;
    const upCalm = lerp(0.03, 0.05, p.reveal) + 0.015 * p.gaze;
    const tremble = m * (1 - smoothstep(0.85, 1, m) * 0.6);
    drawEye(
      ctx,
      {
        x: ex,
        y: ey,
        w,
        up: lerp(upCalm, 0.175, eo) * s * big,
        low: lerp(0.02, 0.105, eo) * s * big,
        tilt: lerp(-0.06, -0.21, eo) + asy(17, side) * 0.12,
        irisR: lerp(0.072, 0.05, eo) * s,
        pupilR: lerp(lerp(0.03, 0.016, p.gaze), 0.011, eo) * s,
        lookX: lerp(0.004, -0.024, p.gaze) * s + snoise1(time * 14 + side * 5) * 0.012 * s * tremble,
        lookY: lerp(0.016, 0.004, p.gaze) * s + snoise1(time * 12 + side * 9) * 0.008 * s * tremble,
        bloodshot: eo,
        seed: 81,
        sclera: PIGMENT.gofun,
        iris: mix(PIGMENT.konjou, PIGMENT.kinpaku, eo),
        line: lerp(0.017, 0.032, eo) * s,
        glint: p.gaze * 0.55 * (1 - eo) + eo * 0.85,
      },
      tone,
    );
    // 二重の線・下瞼の膨らみ（静）／ 血の涙（動）
    if (eo < 0.95) {
      ctx.globalAlpha = 1 - eo;
      inkStroke(ctx, scaled(catmullRom([0.115, -0.105, 0.24, -0.172, 0.4, -0.162, 0.535, -0.118], 6), s), { color: ink, width: 0.008 * s, seed: 83, taperIn: 0.2, taperOut: 0.4, press: 0.1 });
      inkStroke(ctx, scaled(catmullRom([0.16, -0.045, 0.3, -0.03, 0.46, -0.058], 6), s), { color: tone(PIGMENT.kinKage, 0.8), width: 0.007 * s, seed: 84, taperIn: 0.3, taperOut: 0.4, press: 0 });
      ctx.globalAlpha = 1;
    }
    const tears = smoothstep(0.55, 1, m);
    if (tears > 0.01) {
      for (let k = 0; k < 2; k++) {
        const tx = 0.25 + 0.13 * k + asy(19 + k, side) * 0.03;
        const len = (0.3 + 0.25 * hash(k * 7.1 + (side > 0 ? 1 : 2))) * tears;
        const pts: number[] = [];
        for (let q = 0; q <= 8; q++) {
          const t = q / 8;
          pts.push((tx + 0.012 * Math.sin(t * 7 + k * 2)) * s, ey + (0.07 + len * t) * s);
        }
        inkStroke(ctx, pts, { color: tone(PIGMENT.chi, 0.9), width: 0.02 * s, seed: 86 + k, taperIn: 0.1, taperOut: 0.25, press: 0.2, wobble: 0.5 });
      }
    }
    // 鼻
    const nose = blend(NOSE_CALM, NOSE_WRATH, eo);
    inkStroke(ctx, scaled(catmullRom(nose, 6), s), { color: ink, width: lerp(0.014, 0.024, eo) * s, seed: 91, taperIn: 0.15, taperOut: 0.001, press: 0.1, wobble: 0.15 });
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(lerp(0.075, 0.11, eo) * s, 0.316 * s, lerp(0.034, 0.06, eo) * s, lerp(0.012, 0.028, eo) * s, -0.35, 0, TAU);
    ctx.fill();
    // 憤怒の皺：眉間・法令線
    if (eo > 0.05) {
      ctx.globalAlpha = eo;
      for (let k = 0; k < 3; k++) {
        inkStroke(ctx, scaled(catmullRom([0.012 + 0.018 * k, -0.3 + 0.01 * k, 0.03 + 0.02 * k, -0.2, 0.02 + 0.025 * k, -0.1 + 0.02 * k], 5), s), { color: ink, width: 0.016 * s, seed: 93 + k, taperIn: 0.1, taperOut: 0.5 });
      }
      inkStroke(ctx, scaled(catmullRom([0.2, 0.2, 0.36, 0.25, 0.56, 0.3, 0.69, 0.22 + 0.1 * asy(23, side)], 6), s), { color: ink, width: 0.022 * s, seed: 96, taperIn: 0.08, taperOut: 0.5, dry: 0.5 });
      inkStroke(ctx, scaled(catmullRom([0.14, 0.02, 0.3, 0.07, 0.48, 0.03], 6), s), { color: ink, width: 0.014 * s, seed: 97, taperIn: 0.2, taperOut: 0.5 });
      ctx.globalAlpha = 1;
    } else {
      // 顎のふくらみを示す静かな一筆
      inkStroke(ctx, scaled(catmullRom([0, 0.805, 0.1, 0.8, 0.185, 0.772], 5), s), { color: tone(PIGMENT.kinKage), width: 0.009 * s, seed: 98, taperIn: 0.001, taperOut: 0.5, press: 0 });
    }
    // 顔面に開く眼
    if (extra > 0.01) {
      FACE_EYES.forEach(([fx, fy, tilt, fw], i) => {
        const order = hash(i * 5.7 + (side > 0 ? 2.2 : 8.8));
        const open = smoothstep(order * 0.6, order * 0.6 + 0.3, extra);
        if (open <= 0.01) return;
        const ww = fw * s * (1 + 0.3 * order);
        drawEye(
          ctx,
          {
            x: fx * s,
            y: (fy + (fy > 0.3 ? mo * 0.2 : 0)) * s,
            w: ww,
            up: ww * 0.6 * open,
            low: ww * 0.48 * open,
            tilt,
            irisR: ww * 0.4,
            pupilR: ww * 0.11,
            lookX: snoise1(time * 3.1 + i * 4.7 + side) * ww * 0.35 * (1 - extra),
            lookY: 0,
            bloodshot: 1,
            seed: 110 + i,
            sclera: PIGMENT.kinari,
            iris: PIGMENT.kinpaku,
            line: 0.016 * s,
            glint: extra,
          },
          tone,
        );
      });
    }
    // 輪郭：頭頂から顎へ一息に
    inkStroke(ctx, headHalf(s, mo, asy(1, side)), { color: ink, width: lineW * 1.35, seed: 101, taperIn: 0.001, taperOut: 0.001, press: 0, wobble: 0.3, dry: 0.3 });
    ctx.restore();
  }
  // ══ 口 ══
  drawMouth(ctx, { s, open: mo, skew: asy(27, 1) / Math.max(m, 0.001), time }, tone);
  // ══ 白毫 → 縦に裂ける第三の眼 ══
  if (extra > 0.02) {
    const ww = 0.1 * s;
    drawEye(
      ctx,
      {
        x: 0,
        y: -0.41 * s,
        w: ww,
        up: ww * 0.55 * extra,
        low: ww * 0.55 * extra,
        tilt: Math.PI / 2,
        irisR: ww * 0.42,
        pupilR: ww * 0.1,
        lookX: 0,
        lookY: 0,
        bloodshot: 1,
        seed: 131,
        sclera: PIGMENT.kinari,
        iris: PIGMENT.shu,
        line: 0.022 * s,
        glint: 1,
      },
      tone,
    );
  } else {
    ctx.fillStyle = tone(PIGMENT.gofun);
    ctx.beginPath();
    ctx.arc(0, -0.41 * s, 0.03 * s, 0, TAU);
    ctx.fill();
    for (const side of [1, -1]) {
      ctx.save();
      ctx.scale(side, 1);
      inkStroke(ctx, arcPoints(0, -0.41 * s, 0.031 * s, -Math.PI / 2, Math.PI / 2, 12), { color: ink, width: 0.009 * s, seed: 133, taperIn: 0.001, taperOut: 0.001, press: 0, wobble: 0.1 });
      inkStroke(ctx, spiralPoints(0, -0.41 * s, 0.022 * s, 0.004 * s, -Math.PI / 2, 0.5, 8), { color: tone(PIGMENT.kinKage, 0.7), width: 0.005 * s, seed: 134, taperIn: 0.001, taperOut: 0.3, press: 0 });
      ctx.restore();
    }
  }
  ctx.restore();
}

