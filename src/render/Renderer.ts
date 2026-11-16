/**
 * render/Renderer — 描画エンジンの統括。
 *
 * FrameState（演出パラメータ）だけを入力として 1 フレームを描く。
 * 状態遷移や入力の知識は持たない。合成順は
 *   場面（雲／仏／墜落）→ 雷光 → ビネット → 血のフラッシュ → 白黒反転 → 白飛び／帳 → 和紙
 * の順で、最後に必ず紙の質感を重ねてデジタルの冷たさを消す。
 */
import { TAU, clamp, easeInOut, easeOutCubic, hash, lerp, smoothstep, snoise1 } from '../core/math';
import { PIGMENT, css, desaturate, mix, type RGB } from '../core/palette';
import { Phase, type FrameState } from '../state/types';
import { drawCloudTunnel, type TunnelPalette } from './CloudTunnel';
import { drawDeity } from './Deity';
import { drawEmbers, drawEngulf, drawGraspingArms, drawHellfire, drawShockwave } from './HellFall';
import { PaperTexture } from './PaperTexture';
const HOLE_DARK: RGB = [9, 10, 15];
const HELL_PALETTE: TunnelPalette = {
  hole: [8, 4, 4],
  haze: [52, 12, 9],
  cloudA: PIGMENT.enji,
  cloudB: [44, 24, 21],
  taintA: PIGMENT.bengara,
  taintB: PIGMENT.sumi,
  shade: PIGMENT.sumi,
  rim: PIGMENT.shu,
  rimAlpha: 0.42,
  ink: PIGMENT.sumi,
};
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly paper = new PaperTexture();
  private w = 1;
  private h = 1;
  private frame = 0;
  private deityCache: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; size: number; frame: number } | null = null;
  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.resize();
  }
  /** 表示サイズに合わせて内部解像度を決め、紙質テクスチャを作り直す。 */
  resize(): void {
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const budget = 1_600_000; // 描画負荷を抑える画素数の上限
    const px = cw * ch * dpr * dpr;
    if (px > budget) dpr *= Math.sqrt(budget / px);
    const w = Math.max(2, Math.floor(cw * dpr));
    const h = Math.max(2, Math.floor(ch * dpr));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.paper.resize(w, h);
  }
  render(s: Readonly<FrameState>): void {
    const { ctx, w, h } = this;
    const unit = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const reach = Math.hypot(w, h) / 2;
    this.frame++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css(PIGMENT.sumi);
    ctx.fillRect(0, 0, w, h);
    // ── 画面の痙攣：低周波の揺れ＋毎フレームの細かな震え ──
    const amp = s.shake * unit * 0.02;
    const sx = snoise1(s.time * 27) * amp + (hash(this.frame * 1.31) - 0.5) * amp * 0.9;
    const sy = snoise1(s.time * 31 + 40) * amp + (hash(this.frame * 2.17) - 0.5) * amp * 0.9;
    const tilt = snoise1(s.time * 19 + 7) * s.shake * 0.014;
    const falling = s.phase === Phase.Fall || s.phase === Phase.Blackout;
    ctx.save();
    ctx.translate(cx + sx, cy + sy);
    ctx.rotate(tilt + (falling ? s.roll : 0));
    const zoom = 1 + s.shake * 0.05 + s.pulse * 0.012;
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    switch (s.phase) {
      case Phase.Ascent:
      case Phase.Return:
        this.sceneAscent(s, cx, cy, unit, reach);
        break;
      case Phase.Breakthrough:
      case Phase.Judgment:
      case Phase.Transform:
        this.sceneDeity(s, cx, cy, unit, reach);
        break;
      case Phase.Fall:
      case Phase.Blackout:
        this.sceneFall(s, cx, cy, unit, reach);
        break;
    }
    ctx.restore();
    this.post(s, cx, cy, reach);
    this.paper.draw(ctx, w, h, Math.floor(s.time * 16));
  }
  /* ════════════ 状態1：雲のワームホール ════════════ */
  private sceneAscent(s: Readonly<FrameState>, cx: number, cy: number, unit: number, reach: number): void {
    const d = s.dread;
    const palette: TunnelPalette = {
      hole: mix(HOLE_DARK, [14, 4, 4], d),
      haze: mix(mix(PIGMENT.aiNezu, PIGMENT.konjou, 0.35), [46, 14, 13], d),
      cloudA: PIGMENT.gofun,
      cloudB: PIGMENT.torinoko,
      taintA: PIGMENT.namari,
      taintB: PIGMENT.enji,
      shade: mix(mix(PIGMENT.aiNezu, PIGMENT.konjou, 0.45), mix(PIGMENT.sumi, PIGMENT.enji, 0.25), d),
      rim: PIGMENT.gofun,
      rimAlpha: 0.4 * (1 - d),
      ink: PIGMENT.sumi,
    };
    drawCloudTunnel(this.ctx, {
      cx,
      cy,
      unit,
      reach: reach * 1.12,
      travel: s.travel,
      rMin: unit * (0.027 + 0.03 * Math.pow(s.altitude, 3)),
      dread: d,
      time: s.time,
      fillHole: true,
      holeGlow: smoothstep(0.6, 1, s.altitude) * 0.9,
      glowColor: PIGMENT.kinpaku,
      palette,
    });
    this.drawStreaks(s, cx, cy, reach);
  }
  /** 速度に応じて消失点へ収束する、かすれた筆の流線。 */
  private drawStreaks(s: Readonly<FrameState>, cx: number, cy: number, reach: number): void {
    const v = clamp(Math.abs(s.velocity) * 1.7);
    if (v < 0.04) return;
    const { ctx } = this;
    const tick = Math.floor(s.time * 30);
    ctx.fillStyle = css(mix(PIGMENT.gofun, PIGMENT.sumi, smoothstep(0.25, 0.75, s.dread)), 0.5 * v);
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const h1 = hash(i * 3.3 + tick * 1.7);
      const h2 = hash(i * 7.7 + tick * 0.9);
      const a = h1 * TAU;
      const r0 = reach * (0.16 + 0.9 * h2);
      const r1 = r0 + reach * (0.05 + 0.32 * v) * (0.4 + h2);
      const half = 0.002 + 0.004 * h1;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - half) * r1, cy + Math.sin(a - half) * r1);
      ctx.lineTo(cx + Math.cos(a + half) * r1, cy + Math.sin(a + half) * r1);
    }
    ctx.fill();
  }
  /* ════════════ 状態2〜4：黄金の虚空と仏 ════════════ */
  /**
   * 仏の顔スケール（px / 顔単位）。
   * 顔は左右対称に描かれるため全幅はおよそ 2 倍。頭頂から顎までを含めて
   * 画面に収まるよう、縦横比から上限を決める（端末で頭が切れないように）。
   */
  private deityScale(unit: number): number {
    void unit;
    return this.h >= this.w
      ? Math.min(this.w * 0.43, this.h * 0.34)
      : Math.min(this.w * 0.34, this.h * 0.42);
  }
  private sceneDeity(s: Readonly<FrameState>, cx: number, cy: number, unit: number, reach: number): void {
    const m = s.morph;
    this.drawVoid(s.time, m, s.desat, s.reveal, unit, reach, cx, cy);
    // 顕現のあいだ、気づかぬほど遅く迫る。変貌時は全貌が収まるまで引く。
    const scale = this.deityScale(unit) * (0.9 + 0.1 * easeOutCubic(s.reveal)) * lerp(1, 0.8, easeInOut(m));
    drawDeity(this.ctx, {
      cx,
      cy: cy + unit * 0.015 - scale * 0.07 * m,
      s: scale,
      time: s.time,
      reveal: s.reveal,
      gaze: s.gaze,
      desat: s.desat,
      morph: m,
      reach: reach * 2.6,
    });
  }
  /** 金箔を押した虚空。morph で血と煤の闇へ沈む。 */
  private drawVoid(time: number, m: number, desat: number, reveal: number, unit: number, reach: number, cx: number, cy: number): void {
    const { ctx } = this;
    const tone = (c: RGB, a = 1): string => css(desaturate(c, desat), a);
    const big = reach * 1.6;
    const g = ctx.createRadialGradient(cx, cy - unit * 0.1, unit * 0.1, cx, cy, reach * 1.25);
    g.addColorStop(0, tone(mix(PIGMENT.kinpaku, PIGMENT.chi, m)));
    g.addColorStop(0.55, tone(mix(PIGMENT.kin, PIGMENT.enji, m)));
    g.addColorStop(1, tone(mix(PIGMENT.kinKage, PIGMENT.sumi, m)));
    ctx.fillStyle = g;
    ctx.fillRect(cx - big, cy - big, big * 2, big * 2);
    // 箔の一枚一枚の色むらと、重なり目（箔足）
    const cell = unit * 0.125;
    const nx = Math.ceil(big / cell);
    const ny = Math.ceil(big / cell);
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? tone(mix(PIGMENT.gofun, PIGMENT.shu, m), 0.06) : tone(mix(PIGMENT.kinKage, PIGMENT.sumi, m), 0.09);
      ctx.beginPath();
      for (let iy = -ny; iy < ny; iy++) {
        for (let ix = -nx; ix < nx; ix++) {
          const hc = hash(ix * 12.9 + iy * 78.2);
          if (pass === 0 ? hc < 0.3 : hc > 0.68) ctx.rect(cx + ix * cell, cy + iy * cell, cell, cell);
        }
      }
      ctx.fill();
    }
    ctx.fillStyle = tone(mix(PIGMENT.kinKage, PIGMENT.sumi, m), 0.3);
    ctx.beginPath();
    for (let iy = -ny; iy < ny; iy++) {
      for (let ix = -nx; ix < nx; ix++) {
        const x = cx + ix * cell;
        const y = cy + iy * cell;
        const h1 = hash(ix * 3.7 + iy * 9.1);
        const h2 = hash(ix * 5.3 + iy * 2.9);
        const t1 = cell * (0.006 + 0.022 * h1);
        const t2 = cell * (0.006 + 0.022 * h2);
        // 横の箔足（太さが端から端へ変わる楔）
        ctx.moveTo(x, y);
        ctx.lineTo(x + cell, y + (h1 - 0.5) * cell * 0.02);
        ctx.lineTo(x + cell, y + t1);
        ctx.lineTo(x, y + t1 * 0.25);
        // 縦の箔足
        ctx.moveTo(x, y);
        ctx.lineTo(x + (h2 - 0.5) * cell * 0.02, y + cell);
        ctx.lineTo(x + t2, y + cell);
        ctx.lineTo(x + t2 * 0.25, y);
      }
    }
    ctx.fill();
    // 虚空を漂う金砂子。動くものはこれだけ。
    ctx.fillStyle = tone(mix(PIGMENT.gofun, PIGMENT.shu, m), 0.55 * reveal);
    ctx.beginPath();
    for (let i = 0; i < 44; i++) {
      const h1 = hash(i * 1.93 + 0.2);
      const h2 = hash(i * 4.71 + 1.4);
      const x = cx + (h1 * 2 - 1) * reach + Math.sin(time * 0.13 + i) * unit * 0.02;
      const span = reach * 2;
      const y = cy + reach - ((h2 * span + time * unit * 0.004 * (0.4 + h1)) % span);
      const r = unit * (0.0012 + 0.0028 * h2);
      ctx.moveTo(x + r, y);
      ctx.ellipse(x, y, r * (1 + h1), r, h2 * TAU, 0, TAU);
    }
    ctx.fill();
  }
  /* ════════════ 状態5：墜落 ════════════ */
  private sceneFall(s: Readonly<FrameState>, cx: number, cy: number, unit: number, reach: number): void {
    const { ctx } = this;
    const t = s.phase === Phase.Fall ? s.phaseTime : 1e3;
    // 咆哮ののち、鬼神は遠ざかり、抜け穴が閉じていく（対数的に縮む）
    const close = easeInOut(clamp((t - 0.85) / 2.5));
    const rOpen = reach * 1.32;
    const rMin = Math.exp(lerp(Math.log(rOpen), Math.log(unit * 0.04), close));
    this.drawVoid(s.time, 1, 0, 1, unit, reach, cx, cy);
    const full = this.deityScale(unit) * 0.8;
    const ds = full * Math.pow(rMin / rOpen, 0.92) * (1 + 0.06 * Math.sin(s.roar * Math.PI));
    const dcy = cy + (unit * 0.015 - full * 0.07) * (ds / full);
    if (ds > full * 0.55) {
      drawDeity(ctx, { cx, cy: dcy, s: ds, time: s.time, reveal: 1, gaze: 1, desat: 0, morph: 1, reach: reach * 2.6 });
    } else if (ds > unit * 0.03) {
      this.drawDeityCached(s.time, cx, dcy, ds, full);
    } else {
      // 遥か頭上に残る、赤い眼光だけ
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMin * 1.1);
      eg.addColorStop(0, css(PIGMENT.shu, 0.95));
      eg.addColorStop(0.5, css(PIGMENT.chi, 0.8));
      eg.addColorStop(1, css(PIGMENT.sumi, 1));
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(cx, cy, rMin * 1.2, 0, TAU);
      ctx.fill();
    }
    drawShockwave(ctx, cx, cy, unit, reach, s.roar);
    drawCloudTunnel(ctx, {
      cx,
      cy,
      unit,
      reach: reach * 1.12,
      travel: -s.fallTravel,
      rMin,
      dread: 0.35 + 0.65 * s.descent,
      time: s.time,
      fillHole: false,
      holeGlow: close * 0.5,
      glowColor: PIGMENT.shu,
      palette: HELL_PALETTE,
    });
    drawHellfire(ctx, cx, cy, unit, reach, smoothstep(0.04, 0.55, s.descent), s.time);
    drawEmbers(ctx, cx, cy, unit, reach, s.fallTravel, s.fallSpeed);
    drawGraspingArms(ctx, cx, cy, unit, reach, smoothstep(0.1, 0.85, s.descent), s.time);
    drawEngulf(ctx, cx, cy, reach, s.blackout, s.time);
  }
  /**
   * 遠ざかる鬼神を、数フレームおきに描き直す小さな別紙から転写する。
   * 遠景では細部の筆致を毎フレーム引き直す必要がないため、負荷を大きく抑えられる。
   */
  private drawDeityCached(time: number, cx: number, cy: number, ds: number, full: number): void {
    const cs = full * 0.55;
    const size = Math.ceil(cs * 6);
    if (!this.deityCache || this.deityCache.size !== size) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const cctx = canvas.getContext('2d');
      if (!cctx) return;
      this.deityCache = { canvas, ctx: cctx, size, frame: -1000 };
    }
    const cache = this.deityCache;
    if (this.frame - cache.frame >= 4) {
      cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
      cache.ctx.globalAlpha = 1;
      cache.ctx.clearRect(0, 0, size, size);
      drawDeity(cache.ctx, { cx: size / 2, cy: size / 2, s: cs, time, reveal: 1, gaze: 1, desat: 0, morph: 1, reach: size });
      cache.frame = this.frame;
    }
    const dw = size * (ds / cs);
    this.ctx.drawImage(cache.canvas, cx - dw / 2, cy - dw / 2, dw, dw);
  }
  /* ════════════ ポストエフェクト ════════════ */
  private post(s: Readonly<FrameState>, cx: number, cy: number, reach: number): void {
    const { ctx, w, h } = this;
    // 雷光
    if (s.lightning > 0.02) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = css([226, 232, 240], 0.5 * s.lightning);
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 四隅から迫る闇
    const v = clamp(s.vignette + s.pulse * 0.14);
    if (v > 0.01) {
      const k = Math.min(1, v * 1.45);
      const cold = desaturate(PIGMENT.sumi, s.desat);
      const g = ctx.createRadialGradient(cx, cy, reach * Math.max(0.05, 0.92 - 0.72 * v), cx, cy, reach * 1.03);
      g.addColorStop(0, css(cold, 0));
      g.addColorStop(0.55, css(cold, 0.6 * k));
      g.addColorStop(1, css(cold, 0.97 * k));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // 血の赤
    if (s.flashBlood > 0.01) {
      ctx.fillStyle = css(PIGMENT.chi, clamp(s.flashBlood));
      ctx.fillRect(0, 0, w, h);
    }
    // 白黒反転
    if (s.flashInvert) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 雲を抜けた瞬間の白飛び
    if (s.phase === Phase.Breakthrough && s.whiteout > 0.005) {
      ctx.fillStyle = css(mix(PIGMENT.kinpaku, [255, 251, 238], 0.5 + 0.5 * s.whiteout), Math.pow(s.whiteout, 0.8));
      ctx.fillRect(0, 0, w, h);
    }
    // 回帰の帳
    if (s.phase === Phase.Return && s.veil > 0.005) {
      ctx.fillStyle = css(PIGMENT.sumi, s.veil);
      ctx.fillRect(0, 0, w, h);
    }
  }
}
