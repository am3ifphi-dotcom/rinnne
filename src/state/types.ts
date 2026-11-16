/**
 * state/types — 演出ステートマシンが公開する型。
 * 描画エンジン・音響エンジン・UI はこの FrameState / TimelineEvent だけを
 * 契約として受け取り、互いを直接参照しない。
 */
export enum Phase {
  /** 状態1：待機〜雲のワームホール上昇 */
  Ascent = 'ascent',
  /** 状態2：雲抜けと仏の出現（静寂） */
  Breakthrough = 'breakthrough',
  /** 状態3：審判の間（操作不能） */
  Judgment = 'judgment',
  /** 状態4：変貌・拒絶 */
  Transform = 'transform',
  /** 状態5：地獄への墜落 */
  Fall = 'fall',
  /** 状態5-b：血と闇に呑まれる暗転 */
  Blackout = 'blackout',
  /** 状態5-c：雲の底への回帰 */
  Return = 'return',
}
/** 1フレーム分の演出パラメータ。描画・音響はこの値のみを読む「純粋な出力」。 */
export interface FrameState {
  phase: Phase;
  /** 起動からの経過秒 */
  time: number;
  dt: number;
  /** 現フェーズ突入からの経過秒 */
  phaseTime: number;
  /** 現フェーズの進行度 0..1（Ascent では高度に一致） */
  phaseProgress: number;
  /** 最初の入力（＝音響の解錠）が済んでいるか */
  awakened: boolean;
  /** 長押し中か（Ascent 以外では常に false） */
  holding: boolean;
  /* ── 上昇 ─────────────────────────── */
  /** 高度 0..1。1 で雲を抜ける */
  altitude: number;
  /** 上昇速度（高度/秒）。負は後退 */
  velocity: number;
  /** 雲層トンネルの進行量（層単位） */
  travel: number;
  /** 雲の汚染度・恐怖の強度 0..1 */
  dread: number;
  /* ── 共通ポストエフェクト ───────────── */
  /** 画面の痙攣 0..1 */
  shake: number;
  /** 四隅から迫る闇 0..1 */
  vignette: number;
  /* ── 仏 ───────────────────────────── */
  /** 雲抜け直後の白飛び 0..1 */
  whiteout: number;
  /** 仏の顕現 0..1 */
  reveal: number;
  /** 瞳がこちらへ焦点を合わせる度合い 0..1 */
  gaze: number;
  /** 黄金の退色 0..1 */
  desat: number;
  /** 心拍に同期した脈動（打撃時 1 → 減衰） */
  pulse: number;
  /* ── 変貌 ─────────────────────────── */
  /** 仏 → 鬼神のモーフ 0..1 */
  morph: number;
  /** このフレームを白黒反転させるか */
  flashInvert: boolean;
  /** 血の赤のフラッシュ 0..1 */
  flashBlood: number;
  /* ── 墜落 ─────────────────────────── */
  /** 咆哮・衝撃波の進行 0..1 */
  roar: number;
  /** 墜落の進行 0..1 */
  descent: number;
  /** 墜落時の雲層逆流量（層単位） */
  fallTravel: number;
  /** 落下速度の体感値 0..1 */
  fallSpeed: number;
  /** カメラのロール角（ラジアン） */
  roll: number;
  /** 雷光 0..1 */
  lightning: number;
  /** 血と闇による呑み込み 0..1 */
  blackout: number;
  /** 回帰時の闇の残り 1..0 */
  veil: number;
}
export type TimelineEvent =
  | { type: 'awaken' }
  | { type: 'phase'; phase: Phase; prev: Phase }
  | { type: 'heartbeat'; index: number; total: number }
  | { type: 'thunder'; strength: number }
  | { type: 'release'; altitude: number };
export type TimelineListener = (event: TimelineEvent) => void;
