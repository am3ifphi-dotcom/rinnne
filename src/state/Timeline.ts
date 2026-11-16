/**
 * state/Timeline — 演出タイムライン兼ステートマシン。
 *
 * 入力（長押しの ON/OFF）と経過時間だけを受け取り、
 * 1フレーム分の演出パラメータ（FrameState）を算出する。
 * 描画・音響の知識は一切持たず、イベント購読によって外部へ通知する。
 */
import { clamp, easeInOut, easeOutCubic, lerp, smoothstep, snoise1 } from '../core/math';
import { Phase, type FrameState, type TimelineEvent, type TimelineListener } from './types';
/** 各フェーズの尺（秒）。Ascent は入力依存のため尺を持たない。 */
export const DURATION = {
  [Phase.Breakthrough]: 5.2,
  [Phase.Judgment]: 2.5,
  [Phase.Transform]: 3.4,
  [Phase.Fall]: 8.2,
  [Phase.Blackout]: 3.8,
  [Phase.Return]: 2.8,
} as const;
/** 上昇の物理定数 */
const ASCENT = {
  /** 押下直後の初期加速度 */
  baseAccel: 0.0085,
  /** 速度に比例する加速率（＝指数関数的加速の時定数） */
  expRate: 0.43,
  /** 手を離したときに働く重力 */
  gravity: 0.2,
  /** 後退の終端速度 */
  terminalFall: -0.34,
  /** 後退中に再び押したときの復帰加速度 */
  recover: 0.55,
  /** 無操作時の雲のゆるやかな流れ（層/秒） */
  idleDrift: 0.11,
  /** 速度→雲層進行量の変換 */
  travelGain: 15,
  travelMax: 13,
} as const;
/** 審判の間の心拍タイミング（秒）。間隔が次第に狂い、詰まっていく。 */
const HEARTBEATS = [0.12, 0.9, 1.52, 1.95, 2.2, 2.37] as const;
/** 墜落中の雷鳴 [時刻, 強さ] */
const THUNDERS: ReadonlyArray<readonly [number, number]> = [
  [0.02, 1.0],
  [2.2, 0.65],
  [3.8, 0.85],
  [5.3, 0.7],
  [6.7, 1.0],
];
const NEXT: Record<Exclude<Phase, Phase.Ascent>, Phase> = {
  [Phase.Breakthrough]: Phase.Judgment,
  [Phase.Judgment]: Phase.Transform,
  [Phase.Transform]: Phase.Fall,
  [Phase.Fall]: Phase.Blackout,
  [Phase.Blackout]: Phase.Return,
  [Phase.Return]: Phase.Ascent,
};
function createInitialState(): FrameState {
  return {
    phase: Phase.Ascent,
    time: 0,
    dt: 0,
    phaseTime: 0,
    phaseProgress: 0,
    awakened: false,
    holding: false,
    altitude: 0,
    velocity: 0,
    travel: 0,
    dread: 0,
    shake: 0,
    vignette: 0.18,
    whiteout: 0,
    reveal: 0,
    gaze: 0,
    desat: 0,
    pulse: 0,
    morph: 0,
    flashInvert: false,
    flashBlood: 0,
    roar: 0,
    descent: 0,
    fallTravel: 0,
    fallSpeed: 0,
    roll: 0,
    lightning: 0,
    blackout: 0,
    veil: 0,
  };
}
export class Timeline {
  private readonly state: FrameState = createInitialState();
  private readonly listeners = new Set<TimelineListener>();
  private cursor = 0; // 心拍・雷鳴の発火済みインデックス
  private frame = 0;
  /** 現在の演出パラメータ（読み取り専用の参照） */
  get snapshot(): Readonly<FrameState> {
    return this.state;
  }
  subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(event: TimelineEvent): void {
    this.listeners.forEach((l) => l(event));
  }
  /** 長押しの開始/終了を通知する。Ascent 以外では無視される（＝操作不能）。 */
  setHolding(on: boolean): void {
    const s = this.state;
    if (on && !s.awakened) {
      s.awakened = true;
      this.emit({ type: 'awaken' });
    }
    if (s.phase !== Phase.Ascent) {
      s.holding = false;
      return;
    }
    if (s.holding && !on && s.altitude > 0.04) {
      this.emit({ type: 'release', altitude: s.altitude });
    }
    s.holding = on;
  }
  private enter(phase: Phase): void {
    const s = this.state;
    const prev = s.phase;
    s.phase = phase;
    s.phaseTime = 0;
    s.phaseProgress = 0;
    s.holding = false;
    this.cursor = 0;
    switch (phase) {
      case Phase.Breakthrough:
        s.altitude = 1;
        s.velocity = 0;
        s.shake = 0;
        s.whiteout = 1;
        s.reveal = 0;
        s.gaze = 0;
        s.desat = 0;
        s.morph = 0;
        s.pulse = 0;
        break;
      case Phase.Fall:
        s.fallTravel = 0;
        s.fallSpeed = 0;
        s.roll = 0;
        s.roar = 0;
        s.descent = 0;
        s.blackout = 0;
        break;
      case Phase.Return:
        // 雲の底へ。上昇に関わる全パラメータを初期化する。
        s.altitude = 0;
        s.velocity = 0;
        s.dread = 0;
        s.travel = 0;
        s.morph = 0;
        s.gaze = 0;
        s.desat = 0;
        s.reveal = 0;
        s.whiteout = 0;
        s.roll = 0;
        s.roar = 0;
        s.descent = 0;
        s.fallSpeed = 0;
        s.lightning = 0;
        s.flashBlood = 0;
        s.flashInvert = false;
        s.blackout = 0;
        s.shake = 0;
        s.veil = 1;
        break;
      case Phase.Ascent:
        s.veil = 0;
        break;
      default:
        break;
    }
    this.emit({ type: 'phase', phase, prev });
  }
  /** 1フレーム進める。dt は秒。 */
  update(rawDt: number): Readonly<FrameState> {
    const s = this.state;
    const dt = clamp(rawDt, 0, 0.05);
    s.dt = dt;
    s.time += dt;
    s.phaseTime += dt;
    this.frame++;
    s.pulse *= Math.exp(-dt * 4.2);
    s.lightning *= Math.exp(-dt * 7.5);
    switch (s.phase) {
      case Phase.Ascent:
        this.updateAscent(dt);
        break;
      case Phase.Breakthrough:
        this.updateBreakthrough();
        break;
      case Phase.Judgment:
        this.updateJudgment();
        break;
      case Phase.Transform:
        this.updateTransform();
        break;
      case Phase.Fall:
        this.updateFall(dt);
        break;
      case Phase.Blackout:
        this.updateBlackout(dt);
        break;
      case Phase.Return:
        this.updateReturn(dt);
        break;
    }
    if (s.phase !== Phase.Ascent) {
      const dur = DURATION[s.phase];
      s.phaseProgress = clamp(s.phaseTime / dur);
      if (s.phaseTime >= dur) this.enter(NEXT[s.phase]);
    }
    return s;
  }
  /* ───────── 状態1：上昇 ───────── */
  private updateAscent(dt: number): void {
    const s = this.state;
    if (s.holding) {
      if (s.velocity < 0) s.velocity += ASCENT.recover * dt;
      // dv/dt = a + k·v → 押し続けるほど指数関数的に加速する
      s.velocity += (ASCENT.baseAccel + ASCENT.expRate * Math.max(s.velocity, 0)) * dt;
    } else {
      // 重力に引かれて失速し、やがて後退する
      s.velocity -= ASCENT.gravity * dt;
      if (s.velocity > 0) s.velocity *= Math.exp(-dt * 0.9);
      if (s.velocity < ASCENT.terminalFall) s.velocity = ASCENT.terminalFall;
    }
    s.altitude += s.velocity * dt;
    if (s.altitude <= 0) {
      s.altitude = 0;
      if (s.velocity < 0) s.velocity = 0;
    }
    const speed = Math.sign(s.velocity) * Math.min(ASCENT.travelMax, ASCENT.travelGain * Math.pow(Math.abs(s.velocity), 0.75));
    s.travel += (ASCENT.idleDrift + speed) * dt;
    const dreadTarget = Math.pow(clamp(s.altitude), 0.8);
    s.dread += (dreadTarget - s.dread) * (1 - Math.exp(-dt * 3.2));
    const strain = clamp(Math.abs(s.velocity) * 1.7);
    s.shake = Math.pow(s.dread, 1.5) * (0.3 + 0.7 * strain) + strain * 0.08;
    s.vignette = 0.18 + 0.74 * s.dread;
    s.phaseProgress = clamp(s.altitude);
    if (s.altitude >= 1) this.enter(Phase.Breakthrough);
  }
  /* ───────── 状態2：雲抜け・顕現 ───────── */
  private updateBreakthrough(): void {
    const s = this.state;
    const t = s.phaseTime;
    s.whiteout = 1 - smoothstep(0.1, 2.6, t);
    s.reveal = smoothstep(0.35, 3.8, t);
    s.dread = lerp(s.dread, 0, 0.1);
    s.shake = 0;
    s.vignette = lerp(0.9, 0.1, smoothstep(0, 1.2, t));
    s.gaze = 0;
    s.desat = 0;
  }
  /* ───────── 状態3：審判の間 ───────── */
  private updateJudgment(): void {
    const s = this.state;
    const t = s.phaseTime;
    s.whiteout = 0;
    s.reveal = 1;
    s.gaze = easeInOut(clamp(t / 2.1));
    s.desat = smoothstep(0.05, 2.35, t);
    s.vignette = lerp(0.1, 0.62, smoothstep(0, 2.5, t));
    s.shake = 0;
    while (this.cursor < HEARTBEATS.length && t >= HEARTBEATS[this.cursor]) {
      s.pulse = 1;
      this.emit({ type: 'heartbeat', index: this.cursor, total: HEARTBEATS.length });
      this.cursor++;
    }
  }
  /* ───────── 状態4：変貌 ───────── */
  private updateTransform(): void {
    const s = this.state;
    const t = s.phaseTime;
    if (this.cursor === 0) {
      this.cursor = 1;
      s.lightning = 1;
      this.emit({ type: 'thunder', strength: 1 });
    }
    // 数フレームの白黒反転と血の赤の明滅
    const strobe = t < 0.4;
    s.flashInvert = strobe && this.frame % 4 < 2;
    s.flashBlood = strobe ? (this.frame % 4 < 2 ? 0.15 : 0.9) : 0.55 * Math.exp(-(t - 0.4) * 2.4);
    // 痙攣的なコマ落ちを伴うモーフ（滑らかな補間と段階的な跳躍の混合）
    const raw = easeOutCubic(clamp((t - 0.06) / 2.3));
    const stepped = Math.floor(raw * 7 + 0.5) / 7;
    const spasm = (1 - raw) * 0.05 * snoise1(t * 23);
    s.morph = clamp(lerp(raw, stepped, 0.55) + spasm);
    s.desat = 1 - smoothstep(0, 0.5, t);
    s.gaze = 1;
    s.vignette = 0.62;
    s.shake = clamp(0.95 * Math.exp(-t * 0.9) + 0.32 + 0.2 * smoothstep(2.6, 3.4, t));
  }
  /* ───────── 状態5：墜落 ───────── */
  private updateFall(dt: number): void {
    const s = this.state;
    const t = s.phaseTime;
    const dur = DURATION[Phase.Fall];
    s.morph = 1;
    s.desat = 0;
    s.flashInvert = t < 0.14 && this.frame % 4 < 2;
    s.flashBlood = 0.5 * Math.exp(-t * 3);
    s.roar = clamp(t / 1.5);
    s.descent = clamp((t - 0.8) / (dur - 0.8));
    s.fallSpeed = smoothstep(0.6, 3.6, t);
    s.fallTravel += (1.2 + s.fallSpeed * 10.5) * dt;
    const rollVel = smoothstep(0.7, 2.6, t) * (2.0 + 0.9 * snoise1(t * 0.55 + 3.1));
    s.roll += rollVel * dt;
    s.shake = clamp(1.0 * Math.exp(-t * 1.1) + 0.3 + 0.25 * s.fallSpeed);
    s.vignette = lerp(0.62, 0.86, s.descent);
    s.blackout = 0.55 * smoothstep(dur - 1.9, dur, t);
    while (this.cursor < THUNDERS.length && t >= THUNDERS[this.cursor][0]) {
      const strength = THUNDERS[this.cursor][1];
      s.lightning = strength;
      this.emit({ type: 'thunder', strength });
      this.cursor++;
    }
  }
  /* ───────── 暗転 ───────── */
  private updateBlackout(dt: number): void {
    const s = this.state;
    const t = s.phaseTime;
    s.blackout = 0.55 + 0.45 * smoothstep(0, 1.0, t);
    s.fallTravel += 9 * (1 - smoothstep(0, 1.2, t)) * dt;
    s.roll += 1.6 * (1 - smoothstep(0, 1.2, t)) * dt;
    s.shake = 0.4 * (1 - smoothstep(0, 1.0, t));
    s.flashBlood = 0;
    s.flashInvert = false;
  }
  /* ───────── 回帰 ───────── */
  private updateReturn(dt: number): void {
    const s = this.state;
    s.travel += ASCENT.idleDrift * dt;
    s.veil = 1 - smoothstep(0.15, 2.7, s.phaseTime);
    s.vignette = 0.18;
  }
}
