/**
 * core/math — 純粋関数のみの数学ユーティリティ。
 * 乱数・ノイズはすべて決定論的（シード駆動）で、描画と音響の双方から参照される。
 */
export const TAU = Math.PI * 2;
export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t: number): number => {
  const c = clamp(t);
  return c * c * c;
};
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
/** 0..1 の決定論的ハッシュ */
export const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
export const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + 74.7) * 43758.5453123;
  return s - Math.floor(s);
};
/** 1次元バリューノイズ（0..1） */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}
/** 1次元バリューノイズ（-1..1） */
export const snoise1 = (x: number): number => noise1(x) * 2 - 1;
/** 2次元バリューノイズ（0..1） */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(hash2(ix, iy), hash2(ix + 1, iy), ux),
    lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux),
    uy,
  );
}
/** 非整数ブラウン運動（1次元, -1..1） */
export function fbm1(x: number, octaves = 3): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let f = x;
  for (let o = 0; o < octaves; o++) {
    sum += snoise1(f + o * 17.31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
/** 非整数ブラウン運動（2次元, 0..1） */
export function fbm2(x: number, y: number, octaves = 4): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(fx + o * 31.7, fy - o * 13.3) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.02;
    fy *= 2.02;
  }
  return sum / norm;
}
/** シード付き擬似乱数生成器（mulberry32） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Catmull-Rom スプラインで制御点列を滑らかな折れ線へ展開する。
 * @param pts  [x0,y0,x1,y1,...] のフラット配列
 * @param samples 1区間あたりの分割数
 */
export function catmullRom(pts: number[], samples: number, closed = false): number[] {
  const n = pts.length / 2;
  const out: number[] = [];
  const get = (i: number): [number, number] => {
    let k = i;
    if (closed) k = ((i % n) + n) % n;
    else k = clamp(i, 0, n - 1);
    return [pts[k * 2], pts[k * 2 + 1]];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = get(i - 1);
    const [x1, y1] = get(i);
    const [x2, y2] = get(i + 1);
    const [x3, y3] = get(i + 2);
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
      );
    }
  }
  if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out;
}
