/**
 * app/Experience — 合成ルート。
 *
 * 「状態（Timeline）」「描画（Renderer）」「音響（AudioEngine）」を生成して配線し、
 * フレームループを回す。各エンジンは互いを知らず、ここだけが全員を知っている。
 * UI へは、変化があったときだけ粗い粒度のスナップショットを通知する。
 */
import { AudioEngine } from '../audio/AudioEngine';
import { Renderer } from '../render/Renderer';
import { Timeline } from '../state/Timeline';
import { Phase, type FrameState } from '../state/types';
/** UI が必要とする最小限の情報（毎フレームではなく変化時のみ通知） */
export interface UiSnapshot {
  phase: Phase;
  awakened: boolean;
  holding: boolean;
  /** 高度（丈）。百丈刻み */
  height: number;
  /** 雲の汚染段階 0..4（文字色の切り替え用） */
  dreadStep: number;
  /** 手を離して後退している最中か */
  slipping: boolean;
  /** 審判の言葉を示すか */
  verdict: boolean;
  /** 変貌の予兆として、審判の「間」に入ったか */
  condemned: boolean;
  /** 暗転の底の言葉を示すか */
  epitaph: boolean;
  muted: boolean;
}
export const INITIAL_UI: UiSnapshot = {
  phase: Phase.Ascent,
  awakened: false,
  holding: false,
  height: 0,
  dreadStep: 0,
  slipping: false,
  verdict: false,
  condemned: false,
  epitaph: false,
  muted: false,
};
/** 雲を抜ける高さ（丈）。三十三天にちなむ。 */
const SUMMIT = 33000;
export class Experience {
  private readonly timeline = new Timeline();
  private readonly audio = new AudioEngine();
  private readonly renderer: Renderer;
  private readonly uiListeners = new Set<(ui: UiSnapshot) => void>();
  private readonly unsubscribe: () => void;
  private readonly observer: ResizeObserver | null = null;
  private ui: UiSnapshot = INITIAL_UI;
  private raf = 0;
  private last = 0;
  private disposed = false;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.unsubscribe = this.timeline.subscribe((event) => this.audio.handleEvent(event));
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.renderer.resize());
      this.observer.observe(canvas);
    }
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.tick);
  }
  /** 長押しの開始/終了（入力制御から呼ばれる） */
  setHolding(on: boolean): void {
    if (on) this.audio.unlock();
    this.timeline.setHolding(on);
  }
  toggleMute(): void {
    this.audio.setMuted(!this.audio.isMuted);
    this.publish(this.timeline.snapshot, true);
  }
  subscribeUi(listener: (ui: UiSnapshot) => void): () => void {
    this.uiListeners.add(listener);
    listener(this.ui);
    return () => {
      this.uiListeners.delete(listener);
    };
  }
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsubscribe();
    this.observer?.disconnect();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.uiListeners.clear();
    this.audio.dispose();
  }
  private readonly onResize = (): void => this.renderer.resize();
  private readonly onVisibility = (): void => {
    // 裏に回ったら手を離した扱いにし、復帰時に時間が飛ばないようにする
    if (document.hidden) this.timeline.setHolding(false);
    this.last = 0;
  };
  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    const dt = this.last === 0 ? 1 / 60 : (now - this.last) / 1000;
    this.last = now;
    const state = this.timeline.update(dt);
    this.audio.update(state);
    this.renderer.render(state);
    this.publish(state, false);
    this.raf = requestAnimationFrame(this.tick);
  };
  private publish(s: Readonly<FrameState>, force: boolean): void {
    const ascent = s.phase === Phase.Ascent;
    const next: UiSnapshot = {
      phase: s.phase,
      awakened: s.awakened,
      holding: s.holding,
      height: ascent ? Math.floor((s.altitude * SUMMIT) / 100) * 100 : 0,
      dreadStep: Math.min(4, Math.floor(s.dread * 5)),
      slipping: ascent && !s.holding && s.altitude > 0.05 && s.velocity < 0.01,
      verdict: s.phase === Phase.Transform && s.phaseTime > 1.15,
      condemned: s.phase === Phase.Judgment,
      epitaph: s.phase === Phase.Blackout && s.phaseTime > 1.5,
      muted: this.audio.isMuted,
    };
    const prev = this.ui;
    const changed =
      force ||
      (Object.keys(next) as Array<keyof UiSnapshot>).some((key) => next[key] !== prev[key]);
    if (!changed) return;
    this.ui = next;
    this.uiListeners.forEach((l) => l(next));
  }
}
