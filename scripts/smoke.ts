/**
 * scripts/smoke — ヘッドレス・スモークテスト（開発補助）。
 *
 * ブラウザ無しで描画エンジンだけを走らせ、全フェーズを通した絵を PNG に落とす。
 * 見た目の退行（仏の頭が切れる、地獄が真っ黒、等）を目で確認するためだけの道具で、
 * 製品のコードパスには含まれない。
 *
 *   npm run smoke            （390x844 の縦長）
 *   npm run smoke -- 1440 900（横長）
 *
 * 依存は @napi-rs/canvas のみ。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { Renderer } from '../src/render/Renderer';
import { Phase } from '../src/state/types';
import { Timeline } from '../src/state/Timeline';

const W = Number(process.argv[2] ?? 390);
const H = Number(process.argv[3] ?? 844);
const OUT = 'smoke-out';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const real = createCanvas(W, H);
// Renderer が触る canvas の API だけを持つ最小の代替。
const canvas = {
  clientWidth: W,
  clientHeight: H,
  getContext: () => real.getContext('2d'),
  get width() {
    return real.width;
  },
  set width(v: number) {
    real.width = v;
  },
  get height() {
    return real.height;
  },
  set height(v: number) {
    real.height = v;
  },
  toBuffer: (t: 'image/png') => real.toBuffer(t),
} as unknown as HTMLCanvasElement;

// 描画側が暗黙に参照するブラウザのグローバル
const g = globalThis as unknown as Record<string, unknown>;
g.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1 };
g.document = { createElement: () => createCanvas(64, 64) };

const renderer = new Renderer(canvas);
const timeline = new Timeline();
const DT = 1 / 30;
let simTime = 0;
let phase = '';

for (let i = 0; i < 30 * 78; i++) {
  // 上昇中は押し続ける。雲を抜けたら手を離す（以後は操作不能）。
  if (timeline.snapshot.phase === Phase.Ascent) timeline.setHolding(true);
  const s = timeline.update(DT);
  simTime += DT;
  if (s.phase !== phase) {
    phase = s.phase;
    console.log(`phase -> ${phase} @ ${simTime.toFixed(1)}s`);
  }
  if (i % 15 === 0) {
    renderer.render(s);
    const name = `${simTime.toFixed(1).padStart(5, '0')}-${s.phase}.png`;
    writeFileSync(`${OUT}/${name}`, canvas.toBuffer('image/png'));
  }
}
console.log(`done: ${OUT}/`);
