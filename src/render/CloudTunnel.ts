/**
 * render/CloudTunnel — 渦雲のワームホール。
 *
 * 真上を見上げる一点透視。雲は「内縁が瘤状に波打つ輪」の層として表現し、
 * 層の半径を R = rMin·exp(g·d) の対数投影で配置する（d は視点からの奥行き順位）。
 * 奥の層から順に「内縁より外側をすべて塗り潰す」ため、
 * 消失点の抜け穴以外は必ず雲で埋め尽くされる。
 *
 * 上昇（生成り→鉛→暗赤に汚染）と墜落（血と煤の逆流）の双方で使う。
 */
import { TAU, clamp, hash, lerp, smoothstep } from '../core/math';
import { css, mix, type RGB } from '../core/palette';
import { inkStroke, spiralPoints } from './Brush';
export interface TunnelPalette {
  /** 抜け穴の闇 */
  hole: RGB;
  /** 奥の霞 */
  haze: RGB;
  /** 雲の地色（層ごとに A〜B を揺らす） */
  cloudA: RGB;
  cloudB: RGB;
  /** 汚染色：第一段（鉛色）・第二段（暗赤） */
  taintA: RGB;
  taintB: RGB;
  /** 手前の層が落とす陰（暈し） */
  shade: RGB;
  /** 内縁の照り */
  rim: RGB;
  rimAlpha: number;
  /** 墨 */
  ink: RGB;
}
export interface TunnelParams {
  cx: number;
  cy: number;
  /** 画面短辺（px） */
  unit: number;
  /** 画面を覆い切るのに必要な半径（px） */
  reach: number;
  /** 進行量（層単位）。増えると雲が手前へ迫り、減ると奥へ逆流する */
  travel: number;
  /** 最奥の層の内半径（px）＝抜け穴の大きさ */
  rMin: number;
  /** 汚染度 0..1 */
  dread: number;
  time: number;
  /** 抜け穴を闇で塗るか（背後に別の絵を見せる場合は false） */
  fillHole: boolean;
  /** 抜け穴の奥に漏れる光 0..1 */
  holeGlow: number;
  glowColor: RGB;
  palette: TunnelPalette;
}
/** 層間の対数成長率（1層手前に来るごとに e^GROWTH 倍） */
const GROWTH = 0.3;
const lobeBuf: number[] = [];
export function drawCloudTunnel(ctx: CanvasRenderingContext2D, p: TunnelParams): void {
  const { cx, cy, unit, reach, palette: pal } = p;
  if (p.fillHole) {
    ctx.fillStyle = css(pal.hole);
    ctx.beginPath();
    ctx.arc(cx, cy, p.rMin * 4.5, 0, TAU);
    ctx.fill();
  }
  if (p.holeGlow > 0.01) {
    const gr = p.rMin * (2.2 + 2.5 * p.holeGlow);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
    g.addColorStop(0, css(p.glowColor, p.holeGlow));
    g.addColorStop(0.45, css(p.glowColor, p.holeGlow * 0.5));
    g.addColorStop(1, css(p.glowColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, TAU);
    ctx.fill();
  }
  const first = Math.floor(p.travel);
  const limit = reach * 1.2;
  // 奥（d 小）→ 手前（d 大）の順に重ね塗り
  for (let layer = first; ; layer--) {
    const d = p.travel - layer;
    const R = p.rMin * Math.exp(GROWTH * d);
    if (R > limit || d > 40) break;
    drawLayer(ctx, p, layer, d, R, unit);
  }
}
function drawLayer(
  ctx: CanvasRenderingContext2D,
  p: TunnelParams,
  layer: number,
  d: number,
  R: number,
  unit: number,
): void {
  const { cx, cy, palette: pal, reach } = p;
  const h1 = hash(layer * 3.31 + 0.7);
  const h2 = hash(layer * 5.77 + 1.9);
  const h3 = hash(layer * 9.13 + 4.2);
  // 手前へ抜けていく層は霧のように透けて消える
  const pass = 1 - smoothstep(0.78, 1.18, R / reach);
  if (pass <= 0.004) return;
  // 0=抜け穴に溶けている / 1=はっきり見える
  const emerge = smoothstep(0, 1.7, d);
  const near = smoothstep(1.2, 9, d);
  // ── 色：地色 → 汚染 → 霞 ──
  let base = mix(pal.cloudA, pal.cloudB, h1);
  const q = smoothstep(h2 * 0.55, h2 * 0.55 + 0.45, p.dread);
  base = mix(base, pal.taintA, smoothstep(0, 0.6, q) * 0.92);
  base = mix(base, pal.taintB, smoothstep(0.5, 1, q) * (0.45 + 0.55 * h3));
  const hazed = mix(pal.haze, base, smoothstep(1.2, 6.5, d));
  const color = mix(pal.hole, hazed, emerge);
  // ── 形：瘤（ロブ）が内側へせり出す波打つ内縁 ──
  const dir = layer % 2 === 0 ? 1 : -1;
  const rot = h1 * TAU + dir * 0.26 * d + p.time * 0.025 * dir + 0.5 * Math.sin(d * 0.35 + h2 * 6);
  const lobes = 8 + Math.floor(h2 * 5);
  let wsum = 0;
  for (let j = 0; j < lobes; j++) wsum += 0.55 + hash(layer * 13.7 + j * 2.3);
  ctx.globalAlpha = pass;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(R * 3.4, reach * 3), 0, TAU);
  let a0 = rot;
  const starts: number[] = [];
  const spans: number[] = [];
  const amps: number[] = [];
  for (let j = 0; j < lobes; j++) {
    const span = ((0.55 + hash(layer * 13.7 + j * 2.3)) / wsum) * TAU;
    const amp = (0.17 + 0.2 * hash(layer * 17.3 + j * 3.1)) * (1 + 0.1 * Math.sin(p.time * 0.6 + j * 1.7 + layer));
    starts.push(a0);
    spans.push(span);
    amps.push(amp);
    const steps = clamp(Math.round(6 + (R * span) / 13), 8, 30);
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      const r = R * (1 + amp * (1 - Math.pow(Math.sin(Math.PI * u), 0.55)));
      const a = a0 + span * u;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (j === 0 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    a0 += span;
  }
  ctx.closePath();
  ctx.fillStyle = css(color);
  ctx.fill('evenodd');
  // 暈し：手前の層の下に潜るほど陰る
  const shadeAlpha = (0.3 + 0.5 * near) * emerge;
  const sg = ctx.createRadialGradient(cx, cy, R * 1.02, cx, cy, R * 1.85);
  sg.addColorStop(0, css(pal.shade, 0));
  sg.addColorStop(0.4, css(pal.shade, shadeAlpha * 0.5));
  sg.addColorStop(1, css(pal.shade, shadeAlpha));
  ctx.fillStyle = sg;
  ctx.fill('evenodd');
  // 内縁の照り
  if (pal.rimAlpha > 0.01) {
    const rg = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.24);
    rg.addColorStop(0, css(pal.rim, pal.rimAlpha * emerge));
    rg.addColorStop(1, css(pal.rim, 0));
    ctx.fillStyle = rg;
    ctx.fill('evenodd');
  }
  // ── 墨線：手前ほど太く濃く、奥は霞んで細い ──
  const inkAlpha = smoothstep(0.5, 3.2, d) * (0.35 + 0.65 * near);
  if (inkAlpha > 0.02) {
    const lw = clamp(R * 0.017, 0.6, unit * 0.032);
    const ink = css(mix(color, pal.ink, 0.55 + 0.45 * near));
    const faint = css(mix(color, pal.ink, 0.3 + 0.35 * near));
    ctx.globalAlpha = pass * inkAlpha;
    for (let j = 0; j < lobes; j++) {
      const span = spans[j];
      const amp = amps[j];
      const s0 = starts[j];
      const hj = hash(layer * 31.1 + j * 7.7);
      const steps = clamp(Math.round(6 + (R * span) / 13), 8, 30);
      // 瘤の輪郭（一筆ごとに入り・抜きがある）
      lobeBuf.length = 0;
      for (let i = 0; i <= steps; i++) {
        const u = dir > 0 ? i / steps : 1 - i / steps;
        const r = R * (1 + amp * (1 - Math.pow(Math.sin(Math.PI * u), 0.55)));
        const a = s0 + span * u;
        lobeBuf.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      inkStroke(ctx, lobeBuf, {
        color: ink,
        width: lw * (0.7 + 0.7 * hj),
        seed: layer * 31 + j,
        taperIn: 0.07,
        taperOut: 0.3,
        press: 0.5,
        dry: near > 0.45 ? 0.55 : 0,
      });
      // 輪郭に沿う内側の添え線（かすれた薄墨）
      if (R > unit * 0.06) {
        lobeBuf.length = 0;
        const off = 1.07 + 0.05 * hj;
        const es = Math.max(6, Math.round(steps * 0.7));
        for (let i = 0; i <= es; i++) {
          const u = lerp(0.14, 0.86, i / es);
          const r = R * off * (1 + amp * 0.8 * (1 - Math.pow(Math.sin(Math.PI * u), 0.55)));
          const a = s0 + span * u;
          lobeBuf.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        inkStroke(ctx, lobeBuf, {
          color: faint,
          width: lw * 0.5,
          seed: layer * 53 + j,
          taperIn: 0.2,
          taperOut: 0.5,
          press: 0.1,
          dry: 0.7,
        });
      }
      // 渦：瘤の付け根から雲の内へ巻き込む
      if (hj > 0.3 && R > unit * 0.035) {
        const cr = R * (1 + amp * 0.66);
        const ca = s0 + span * (dir > 0 ? 0.13 : 0.87);
        const sx = cx + Math.cos(ca) * cr;
        const sy = cy + Math.sin(ca) * cr;
        const r0 = R * amp * (0.36 + 0.14 * hj);
        const curl = spiralPoints(sx, sy, r0, r0 * 0.12, ca + Math.PI, dir * (1.15 + 0.35 * hj), 22);
        inkStroke(ctx, curl, {
          color: ink,
          width: lw * (0.65 + 0.4 * hj),
          seed: layer * 71 + j,
          taperIn: 0.1,
          taperOut: 0.45,
          press: 0.55,
        });
      }
    }
  }
  ctx.globalAlpha = 1;
}
