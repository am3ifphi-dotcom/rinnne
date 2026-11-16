/**
 * render/PaperTexture — 和紙と木版の質感オーバーレイ。
 *
 * ・和紙の繊維（楮の長い繊維・塵）
 * ・摺りムラ（馬連の円弧状の擦り跡、顔料の乗りの濃淡）
 * ・微細な粒子ノイズ（毎フレーム位置を変えて「生きた」粒状感に）
 * をリサイズ時に一度だけ生成し、毎フレーム合成する。
 */
import { TAU, fbm2, mulberry32 } from '../core/math';
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return [c, c.getContext('2d')!];
}
export class PaperTexture {
  private shade: HTMLCanvasElement | null = null; // 乗算：暗い繊維・摺りムラ
  private light: HTMLCanvasElement | null = null; // スクリーン：明るい繊維・摺り抜け
  private grain: HTMLCanvasElement;
  private grainPattern: CanvasPattern | null = null;
  constructor() {
    this.grain = this.buildGrain(256);
  }
  /** 粒子ノイズのタイル（中間灰を基準に明暗へ振る） */
  private buildGrain(size: number): HTMLCanvasElement {
    const [c, g] = makeCanvas(size, size);
    const img = g.createImageData(size, size);
    const rnd = mulberry32(8821);
    for (let i = 0; i < img.data.length; i += 4) {
      // 2つの乱数の平均で山型分布にし、粗い粒を時折混ぜる
      let v = (rnd() + rnd()) * 0.5;
      if (rnd() < 0.012) v = rnd() < 0.5 ? 0.05 : 0.95;
      const lum = Math.floor(128 + (v - 0.5) * 190);
      img.data[i] = lum;
      img.data[i + 1] = lum;
      img.data[i + 2] = lum;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  resize(w: number, h: number): void {
    const rnd = mulberry32(1603);
    const [shade, sg] = makeCanvas(w, h);
    const [light, lg] = makeCanvas(w, h);
    const unit = Math.min(w, h);
    // ── 顔料の乗りの濃淡（低周波のムラ）を低解像度で作って引き伸ばす ──
    const mw = 224;
    const mh = Math.max(8, Math.round((mw * h) / w));
    const [mott, mg] = makeCanvas(mw, mh);
    const [mottL, mlg] = makeCanvas(mw, mh);
    const md = mg.createImageData(mw, mh);
    const ml = mlg.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const cloud = fbm2(x * 0.045, y * 0.045, 4); // 絵具の乗りの大きな濃淡
        const grain = fbm2(x * 0.011 + 40, y * 0.62 + 9, 3); // 板目に沿った細い横筋
        const blot = fbm2(x * 0.19 + 7, y * 0.19 + 3, 2); // 細かな摺りかすれ
        const v = cloud * 0.5 + grain * 0.28 + blot * 0.22;
        const i = (y * mw + x) * 4;
        const dark = Math.max(0, v - 0.47) * 1.5;
        md.data[i] = 255 - dark * 92;
        md.data[i + 1] = 255 - dark * 104;
        md.data[i + 2] = 255 - dark * 120;
        md.data[i + 3] = 255;
        const lift = Math.max(0, 0.45 - v) * 1.7;
        ml.data[i] = lift * 118;
        ml.data[i + 1] = lift * 110;
        ml.data[i + 2] = lift * 94;
        ml.data[i + 3] = 255;
      }
    }
    mg.putImageData(md, 0, 0);
    mlg.putImageData(ml, 0, 0);
    sg.imageSmoothingEnabled = true;
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(mott, 0, 0, w, h);
    lg.imageSmoothingEnabled = true;
    lg.imageSmoothingQuality = 'high';
    lg.drawImage(mottL, 0, 0, w, h);
    // ── 馬連の擦り跡：円弧状の細い筋の束 ──
    sg.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const cx = rnd() * w;
      const cy = rnd() * h;
      const r = unit * (0.12 + rnd() * 0.5);
      const a0 = rnd() * TAU;
      const sweep = 0.5 + rnd() * 1.4;
      const strands = 5 + Math.floor(rnd() * 9);
      const dark = rnd() < 0.6;
      const target = dark ? sg : lg;
      for (let k = 0; k < strands; k++) {
        const rr = r + (k - strands / 2) * unit * (0.004 + rnd() * 0.004);
        target.strokeStyle = dark
          ? `rgba(58,44,30,${(0.02 + rnd() * 0.04).toFixed(3)})`
          : `rgba(240,228,200,${(0.015 + rnd() * 0.03).toFixed(3)})`;
        target.lineWidth = unit * (0.0015 + rnd() * 0.004);
        target.beginPath();
        target.arc(cx, cy, Math.max(1, rr), a0 + rnd() * 0.2, a0 + sweep * (0.7 + rnd() * 0.3));
        target.stroke();
      }
    }
    // ── 和紙の繊維：長くうねる楮の繊維と、短い屑 ──
    const fibres = Math.round((w * h) / 1500);
    for (let i = 0; i < fibres; i++) {
      const dark = rnd() < 0.55;
      const target = dark ? sg : lg;
      const long = rnd() < 0.18;
      const len = unit * (long ? 0.05 + rnd() * 0.12 : 0.006 + rnd() * 0.03);
      let x = rnd() * w;
      let y = rnd() * h;
      let a = rnd() * TAU;
      const alpha = long ? 0.05 + rnd() * 0.1 : 0.06 + rnd() * 0.16;
      target.strokeStyle = dark ? `rgba(52,38,24,${alpha.toFixed(3)})` : `rgba(255,246,224,${(alpha * 0.9).toFixed(3)})`;
      target.lineWidth = Math.max(0.4, unit * (0.0005 + rnd() * 0.0011));
      target.beginPath();
      target.moveTo(x, y);
      const segs = long ? 9 : 3;
      for (let s = 0; s < segs; s++) {
        a += (rnd() - 0.5) * (long ? 0.9 : 1.6);
        x += (Math.cos(a) * len) / segs;
        y += (Math.sin(a) * len) / segs;
        target.lineTo(x, y);
      }
      target.stroke();
    }
    // ── 漉き込まれた塵・墨の飛沫 ──
    for (let i = 0; i < Math.round((w * h) / 9000); i++) {
      const dark = rnd() < 0.7;
      const target = dark ? sg : lg;
      const r = unit * (0.0006 + rnd() * rnd() * 0.0035);
      target.fillStyle = dark ? `rgba(30,22,16,${(0.1 + rnd() * 0.3).toFixed(3)})` : `rgba(255,250,235,${(0.1 + rnd() * 0.25).toFixed(3)})`;
      target.beginPath();
      target.ellipse(rnd() * w, rnd() * h, r * (1 + rnd()), r, rnd() * TAU, 0, TAU);
      target.fill();
    }
    this.shade = shade;
    this.light = light;
  }
  /**
   * 現在の描画結果の上に紙質を重ねる。
   * @param frameSeed 粒子ノイズの位置を決めるコマ番号
   */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frameSeed: number): void {
    if (!this.shade || !this.light) return;
    if (!this.grainPattern) this.grainPattern = ctx.createPattern(this.grain, 'repeat');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.shade, 0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.light, 0, 0, w, h);
    if (this.grainPattern) {
      const ox = Math.floor(((frameSeed * 73) % 256 + 256) % 256);
      const oy = Math.floor(((frameSeed * 151) % 256 + 256) % 256);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.42;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this.grainPattern;
      ctx.fillRect(0, 0, w + 256, h + 256);
    }
    ctx.restore();
  }
}
