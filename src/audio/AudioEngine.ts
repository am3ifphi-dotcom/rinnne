/**
 * audio/AudioEngine — リアルタイム音響合成エンジン。
 *
 * 音声ファイルは一切使わず、オシレータ・ノイズ・フィルタ・波形整形のみで構成する。
 * 外部との契約は「FrameState を毎フレーム受け取る update()」と
 * 「TimelineEvent を受け取る handleEvent()」の2つだけ。
 */
import { clamp, lerp } from '../core/math';
import { Phase, type FrameState, type TimelineEvent } from '../state/types';
type NoiseKind = 'white' | 'brown';
const SILENCE = 0.0001;
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private echo!: GainNode;
  private buffers!: Record<NoiseKind, AudioBuffer>;
  private muted = false;
  // 上昇（ドローン＋風）
  private ascentBus!: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private droneFilter!: BiquadFilterNode;
  private droneGain!: GainNode;
  private swellLfo!: OscillatorNode;
  private swellDepth!: GainNode;
  private windBand!: BiquadFilterNode;
  private windGain!: GainNode;
  private howlBand!: BiquadFilterNode;
  private howlGain!: GainNode;
  private howlLfo!: OscillatorNode;
  private howlLfoDepth!: GainNode;
  // 静寂（耳鳴り）
  private tinnitusGain!: GainNode;
  // 墜落（風切り＋地鳴り＋亡者の声）
  private fallBus!: GainNode;
  private fallBand!: BiquadFilterNode;
  private fallWindGain!: GainNode;
  private fallRumbleGain!: GainNode;
  private fallPan: StereoPannerNode | null = null;
  private wailOscs: OscillatorNode[] = [];
  private wailGain!: GainNode;
  /** ユーザー操作を契機に AudioContext を生成・再開する（自動再生制限への対応）。 */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  get isMuted(): boolean {
    return this.muted;
  }
  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
  /* ════════════ グラフ構築 ════════════ */
  private build(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    this.buffers = { white: this.makeNoise(ctx, 'white'), brown: this.makeNoise(ctx, 'brown') };
    // 洞のような残響（フィードバック・ディレイ）
    this.echo = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.127;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 520;
    this.echo.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);
    this.buildAscent(ctx);
    this.buildTinnitus(ctx);
    this.buildFall(ctx);
  }
  private makeNoise(ctx: AudioContext, kind: NoiseKind): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.022 * w) / 1.022;
        d[i] = last * 3.4;
      }
    }
    return buf;
  }
  private noise(kind: NoiseKind, loop = true): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.buffers[kind];
    src.loop = loop;
    return src;
  }
  private shaper(amount: number): WaveShaperNode {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    const ws = this.ctx!.createWaveShaper();
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }
  private buildAscent(ctx: AudioContext): void {
    this.ascentBus = ctx.createGain();
    this.ascentBus.gain.value = 1;
    this.ascentBus.connect(this.master);
    // ── 地鳴りのドローン：わずかにずれた鋸歯波同士のうなり ──
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 90;
    this.droneFilter.Q.value = 2.5;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const grit = this.shaper(3);
    this.droneFilter.connect(grit);
    grit.connect(this.droneGain);
    this.droneGain.connect(this.ascentBus);
    const voices: Array<[OscillatorType, number]> = [
      ['sawtooth', 0.5],
      ['sawtooth', 0.42],
      ['sine', 0.9],
      ['square', 0.12],
    ];
    this.droneOscs = voices.map(([type, level]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 32;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(this.droneFilter);
      o.start();
      return o;
    });
    // 音圧の「うねり」
    this.swellLfo = ctx.createOscillator();
    this.swellLfo.frequency.value = 0.17;
    this.swellDepth = ctx.createGain();
    this.swellDepth.gain.value = 0;
    this.swellLfo.connect(this.swellDepth);
    this.swellDepth.connect(this.droneGain.gain);
    this.swellLfo.start();
    // ── 風：帯域ノイズ＋共鳴の鋭い「唸り声」──
    const wind = this.noise('white');
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = 'bandpass';
    this.windBand.frequency.value = 240;
    this.windBand.Q.value = 1.1;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windBand);
    this.windBand.connect(this.windGain);
    this.windGain.connect(this.ascentBus);
    this.howlBand = ctx.createBiquadFilter();
    this.howlBand.type = 'bandpass';
    this.howlBand.frequency.value = 480;
    this.howlBand.Q.value = 14;
    this.howlGain = ctx.createGain();
    this.howlGain.gain.value = 0;
    wind.connect(this.howlBand);
    this.howlBand.connect(this.howlGain);
    this.howlGain.connect(this.ascentBus);
    this.howlLfo = ctx.createOscillator();
    this.howlLfo.frequency.value = 0.23;
    this.howlLfoDepth = ctx.createGain();
    this.howlLfoDepth.gain.value = 120;
    this.howlLfo.connect(this.howlLfoDepth);
    this.howlLfoDepth.connect(this.howlBand.frequency);
    this.howlLfo.start();
    wind.start();
  }
  private buildTinnitus(ctx: AudioContext): void {
    this.tinnitusGain = ctx.createGain();
    this.tinnitusGain.gain.value = 0;
    this.tinnitusGain.connect(this.master);
    const partials: Array<[number, number]> = [
      [6140, 0.35],
      [9370, 1],
      [11890, 0.5],
    ];
    for (const [f, level] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(this.tinnitusGain);
      o.start();
    }
  }
  private buildFall(ctx: AudioContext): void {
    this.fallBus = ctx.createGain();
    this.fallBus.gain.value = 0;
    if (typeof ctx.createStereoPanner === 'function') {
      this.fallPan = ctx.createStereoPanner();
      this.fallBus.connect(this.fallPan);
      this.fallPan.connect(this.master);
    } else {
      this.fallBus.connect(this.master);
    }
    // 風切り音
    const wind = this.noise('white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    this.fallBand = ctx.createBiquadFilter();
    this.fallBand.type = 'bandpass';
    this.fallBand.frequency.value = 700;
    this.fallBand.Q.value = 0.9;
    this.fallWindGain = ctx.createGain();
    this.fallWindGain.gain.value = 0;
    wind.connect(hp);
    hp.connect(this.fallBand);
    this.fallBand.connect(this.fallWindGain);
    this.fallWindGain.connect(this.fallBus);
    wind.start();
    // 地の底の轟き
    const rumble = this.noise('brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 130;
    this.fallRumbleGain = ctx.createGain();
    this.fallRumbleGain.gain.value = 0;
    rumble.connect(lp);
    lp.connect(this.fallRumbleGain);
    this.fallRumbleGain.connect(this.fallBus);
    rumble.start();
    // 亡者の声：半音でぶつかり合いながら沈んでいく鋸歯波の群れ
    this.wailGain = ctx.createGain();
    this.wailGain.gain.value = 0;
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 760;
    formant.Q.value = 2.2;
    this.wailGain.connect(formant);
    formant.connect(this.fallBus);
    formant.connect(this.echo);
    this.wailOscs = [1, 1.059, 1.189, 1.498, 2.118].map((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 220 * ratio;
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.3 + i * 0.9;
      const vibDepth = ctx.createGain();
      vibDepth.gain.value = 5 + i * 2;
      vib.connect(vibDepth);
      vibDepth.connect(o.frequency);
      vib.start();
      o.connect(this.wailGain);
      o.start();
      return o;
    });
  }
  /* ════════════ 連続制御（毎フレーム） ════════════ */
  update(s: Readonly<FrameState>): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const tau = 0.09;
    if (s.phase === Phase.Ascent || s.phase === Phase.Return) {
      const speed = clamp(Math.abs(s.velocity) * 1.5);
      // 押下時間に連動する強度：高度（＝積算された押下）と現在の速度の合成
      const drive = clamp(Math.pow(s.altitude, 0.7) * 0.72 + speed * 0.55);
      const idle = s.awakened ? 0.05 : 0;
      const f0 = 30 + 34 * drive + 6 * speed;
      const ratios = [1, 1.498 + 0.012 * drive, 0.5, 2.02 + 0.05 * drive];
      this.droneOscs.forEach((o, i) => o.frequency.setTargetAtTime(f0 * ratios[i], now, tau));
      this.droneFilter.frequency.setTargetAtTime(70 + 900 * drive * drive, now, tau);
      const droneLevel = (idle + 0.6 * drive) * (s.holding ? 1 : 0.55);
      this.droneGain.gain.setTargetAtTime(droneLevel, now, 0.16);
      this.swellLfo.frequency.setTargetAtTime(0.17 + 7.5 * drive * drive, now, tau);
      this.swellDepth.gain.setTargetAtTime(droneLevel * 0.42, now, 0.16);
      this.windBand.frequency.setTargetAtTime(220 + 1500 * drive, now, tau);
      this.windBand.Q.setTargetAtTime(1.1 + 3.6 * drive, now, tau);
      this.windGain.gain.setTargetAtTime(idle * 1.4 + 0.5 * drive + 0.2 * speed, now, 0.12);
      this.howlBand.frequency.setTargetAtTime(420 + 760 * drive, now, tau);
      this.howlLfo.frequency.setTargetAtTime(0.23 + 2.4 * drive, now, tau);
      this.howlLfoDepth.gain.setTargetAtTime(110 + 380 * drive, now, tau);
      this.howlGain.gain.setTargetAtTime(idle * 2 + 1.5 * drive, now, 0.12);
    }
    if (s.phase === Phase.Fall || s.phase === Phase.Blackout) {
      const v = s.fallSpeed;
      const tumble = Math.sin(s.roll);
      this.fallBand.frequency.setTargetAtTime(650 + 2100 * v + 500 * tumble * v, now, 0.06);
      this.fallBand.Q.setTargetAtTime(0.8 + 2.4 * v, now, 0.06);
      this.fallWindGain.gain.setTargetAtTime(0.85 * v * (0.75 + 0.25 * tumble), now, 0.06);
      this.fallRumbleGain.gain.setTargetAtTime(0.25 + 0.75 * v, now, 0.1);
      this.fallPan?.pan.setTargetAtTime(tumble * 0.65 * v, now, 0.05);
      // 落ちるほどに沈み込む亡者の声
      const base = lerp(330, 96, s.descent);
      const ratios = [1, 1.059, 1.189, 1.498, 2.118];
      this.wailOscs.forEach((o, i) => o.frequency.setTargetAtTime(base * ratios[i], now, 0.2));
      this.wailGain.gain.setTargetAtTime(0.07 * v, now, 0.2);
    }
  }
  /* ════════════ 離散イベント ════════════ */
  handleEvent(e: TimelineEvent): void {
    if (e.type === 'awaken') {
      this.unlock();
      return;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    switch (e.type) {
      case 'phase':
        this.onPhase(e.phase, now);
        break;
      case 'heartbeat':
        this.heartbeat(e.index / Math.max(1, e.total - 1), now);
        break;
      case 'thunder':
        this.thunder(e.strength, now);
        break;
      case 'release':
        this.sigh(clamp(e.altitude), now);
        break;
    }
  }
  private cut(param: AudioParam, now: number, to: number, time: number): void {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + time);
  }
  private onPhase(phase: Phase, now: number): void {
    switch (phase) {
      case Phase.Breakthrough:
        // 轟音を瞬時に遮断。残るのは耳鳴りだけ。
        this.cut(this.ascentBus.gain, now, 0, 0.03);
        this.tinnitusGain.gain.cancelScheduledValues(now);
        this.tinnitusGain.gain.setValueAtTime(0, now);
        this.tinnitusGain.gain.linearRampToValueAtTime(0.016, now + 0.05);
        this.tinnitusGain.gain.setTargetAtTime(0.0035, now + 0.3, 1.6);
        break;
      case Phase.Transform:
        this.cut(this.tinnitusGain.gain, now, 0, 0.02);
        this.scrape(now);
        this.cluster(now);
        break;
      case Phase.Fall:
        this.cut(this.fallBus.gain, now, 1, 0.25);
        this.roar(now);
        break;
      case Phase.Blackout:
        this.cut(this.fallBus.gain, now, 0, 1.5);
        this.thud(now + 0.9);
        break;
      case Phase.Return:
        this.cut(this.ascentBus.gain, now, 1, 2.4);
        break;
      default:
        break;
    }
  }
  /** 打撃的エンベロープ（瞬時の立ち上がり→指数減衰） */
  private strike(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
    param.setValueAtTime(SILENCE, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(SILENCE, t + attack + decay);
  }
  /** 心拍：k(0..1) が進むほど低く、重く、湿っていく。 */
  private heartbeat(k: number, now: number): void {
    const ctx = this.ctx!;
    const beat = (t: number, level: number, pitch: number): void => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(pitch, t);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.48, t + 0.16);
      const g = ctx.createGain();
      this.strike(g.gain, t, level, 0.012, 0.26 + 0.2 * k);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 0.8);
      // 肉の鈍い衝突音
      const n = this.noise('brown', false);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 150 - 60 * k;
      const ng = ctx.createGain();
      this.strike(ng.gain, t, level * 0.9, 0.006, 0.14 + 0.1 * k);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(this.master);
      n.start(t, Math.random() * 2);
      n.stop(t + 0.5);
      // 湿り気：粘った中域のノイズが尾を引く
      const w = this.noise('white', false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420, t);
      bp.frequency.exponentialRampToValueAtTime(170, t + 0.3);
      bp.Q.value = 3.5;
      const wg = ctx.createGain();
      this.strike(wg.gain, t + 0.015, level * 0.22 * k, 0.03, 0.22 + 0.25 * k);
      w.connect(bp);
      bp.connect(wg);
      wg.connect(this.master);
      wg.connect(this.echo);
      w.start(t, Math.random() * 2);
      w.stop(t + 0.9);
    };
    const pitch = 66 - 20 * k;
    beat(now, 0.8 + 0.35 * k, pitch);
    beat(now + 0.15 + 0.035 * k, 0.5 + 0.3 * k, pitch * 1.12);
  }
  /** 金属を引っ掻く不協和音：非整数倍音の鋸歯波群＋ざらついた振幅変調 */
  private scrape(now: number): void {
    const ctx = this.ctx!;
    const dur = 3.3;
    const out = ctx.createGain();
    this.strike(out.gain, now, 0.34, 0.008, dur);
    out.gain.setValueAtTime(0.34, now + 0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 620;
    const dist = this.shaper(40);
    const am = ctx.createGain();
    am.gain.value = 0.55;
    hp.connect(dist);
    dist.connect(am);
    am.connect(out);
    out.connect(this.master);
    out.connect(this.echo);
    // 爪が引っ掛かる周期的なざらつき
    const rasp = ctx.createOscillator();
    rasp.type = 'sawtooth';
    rasp.frequency.setValueAtTime(37, now);
    rasp.frequency.linearRampToValueAtTime(71, now + dur);
    const raspDepth = ctx.createGain();
    raspDepth.gain.value = 0.45;
    rasp.connect(raspDepth);
    raspDepth.connect(am.gain);
    rasp.start(now);
    rasp.stop(now + dur + 0.2);
    const ratios = [1, 1.071, 1.414, 2.093, 2.776, 3.947, 5.331, 7.129];
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'square' : 'sawtooth';
      const f = 318 * r;
      o.frequency.setValueAtTime(f * 0.94, now);
      o.frequency.exponentialRampToValueAtTime(f * (1.12 + 0.03 * i), now + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6.5 + i * 1.7;
      const depth = ctx.createGain();
      depth.gain.value = f * 0.022;
      vib.connect(depth);
      depth.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.3 / (1 + i * 0.35);
      o.connect(g);
      g.connect(hp);
      vib.start(now);
      o.start(now);
      vib.stop(now + dur + 0.2);
      o.stop(now + dur + 0.2);
    });
    // 擦過ノイズ（共鳴点が揺れ動く）
    const n = this.noise('white', false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(2600, now);
    bp.frequency.exponentialRampToValueAtTime(5200, now + 0.9);
    bp.frequency.exponentialRampToValueAtTime(3100, now + dur);
    const ng = ctx.createGain();
    ng.gain.value = 1.6;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(am);
    n.start(now);
    n.stop(now + Math.min(dur, 3.8));
  }
  /** 鼓膜を刺す半音クラスター */
  private cluster(now: number): void {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    this.strike(out.gain, now, 0.42, 0.004, 2.6);
    const dist = this.shaper(14);
    dist.connect(out);
    out.connect(this.master);
    out.connect(this.echo);
    const freqs = [58.27, 61.74, 233.08, 246.94, 277.18, 466.16, 493.88, 739.99, 1479.98, 1567.98];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, now);
      o.frequency.linearRampToValueAtTime(f * (i % 2 ? 0.972 : 1.03), now + 2.6);
      const g = ctx.createGain();
      g.gain.value = 0.16;
      o.connect(g);
      g.connect(dist);
      o.start(now);
      o.stop(now + 2.8);
    });
  }
  /** 雷鳴のような衝撃音 */
  private thunder(strength: number, now: number): void {
    const ctx = this.ctx!;
    // 轟き
    const n = this.noise('white', false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3400, now);
    lp.frequency.exponentialRampToValueAtTime(70, now + 1.9);
    const g = ctx.createGain();
    this.strike(g.gain, now, 1.1 * strength, 0.004, 2.6);
    n.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    g.connect(this.echo);
    n.start(now, Math.random());
    n.stop(now + 2.9);
    // 空気が裂ける細かな破裂
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.028 + Math.random() * 0.03;
      const c = this.noise('white', false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800 + Math.random() * 2600;
      const cg = ctx.createGain();
      this.strike(cg.gain, t, 0.5 * strength * (1 - i / 8), 0.002, 0.05 + Math.random() * 0.08);
      c.connect(hp);
      hp.connect(cg);
      cg.connect(this.master);
      c.start(t, Math.random() * 3);
      c.stop(t + 0.3);
    }
    // 腹に落ちる低音
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(23, now + 1.3);
    const sg = ctx.createGain();
    this.strike(sg.gain, now, 1.0 * strength, 0.006, 1.7);
    sub.connect(sg);
    sg.connect(this.master);
    sub.start(now);
    sub.stop(now + 2);
  }
  /** 鬼神の咆哮：歪ませた低い鋸歯波をフォルマントに通し、喉の震えで刻む */
  private roar(now: number): void {
    const ctx = this.ctx!;
    const dur = 2.6;
    const out = ctx.createGain();
    out.gain.setValueAtTime(SILENCE, now);
    out.gain.linearRampToValueAtTime(0.85, now + 0.06);
    out.gain.setValueAtTime(0.85, now + 0.9);
    out.gain.exponentialRampToValueAtTime(SILENCE, now + dur);
    out.connect(this.master);
    out.connect(this.echo);
    const throat = ctx.createGain();
    throat.gain.value = 0.6;
    const growl = ctx.createOscillator();
    growl.type = 'square';
    growl.frequency.setValueAtTime(27, now);
    growl.frequency.linearRampToValueAtTime(17, now + dur);
    const growlDepth = ctx.createGain();
    growlDepth.gain.value = 0.4;
    growl.connect(growlDepth);
    growlDepth.connect(throat.gain);
    growl.start(now);
    growl.stop(now + dur + 0.1);
    throat.connect(out);
    const dist = this.shaper(60);
    const formants: Array<[number, number, number]> = [
      [310, 4, 1],
      [780, 5, 0.8],
      [1320, 6, 0.5],
      [2700, 7, 0.25],
    ];
    for (const [f, q, level] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 1.15, now);
      bp.frequency.exponentialRampToValueAtTime(f * 0.78, now + dur);
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      dist.connect(bp);
      bp.connect(g);
      g.connect(throat);
    }
    [1, 1.497, 2.03, 0.5].forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(64 * r, now);
      o.frequency.exponentialRampToValueAtTime(43 * r, now + dur);
      const g = ctx.createGain();
      g.gain.value = 0.5 - i * 0.07;
      o.connect(g);
      g.connect(dist);
      o.start(now);
      o.stop(now + dur + 0.1);
    });
    const breath = this.noise('white', false);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    breath.connect(bg);
    bg.connect(dist);
    breath.start(now);
    breath.stop(now + dur);
  }
  /** 暗転の底で響く最後の一撃 */
  private thud(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(52, t);
    o.frequency.exponentialRampToValueAtTime(19, t + 1.4);
    const g = ctx.createGain();
    this.strike(g.gain, t, 0.9, 0.01, 2.2);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 2.6);
  }
  /** 手を離した瞬間、風が息を吐くように沈む */
  private sigh(altitude: number, now: number): void {
    const ctx = this.ctx!;
    const n = this.noise('white', false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(500 + 1400 * altitude, now);
    bp.frequency.exponentialRampToValueAtTime(140, now + 1.3);
    const g = ctx.createGain();
    this.strike(g.gain, now, 0.12 + 0.3 * altitude, 0.08, 1.3);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.ascentBus);
    n.start(now, Math.random() * 2);
    n.stop(now + 1.6);
  }
}
