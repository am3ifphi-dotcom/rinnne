/**
 * ui/Overlay — 画面に浮かぶ言葉。
 *
 * 置くのは縦書きの明朝体だけ。ボタンも枠も持たない。
 * 文字の縁は SVG フィルタで荒らし、摺られた墨のように滲ませる。
 * 表示の可否は UiSnapshot から導出するだけで、演出の進行には関与しない。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { UiSnapshot } from '../app/Experience';
import { Phase } from '../state/types';
import { toKanji } from './kanji';
interface OverlayProps {
  ui: UiSnapshot;
  onToggleMute(): void;
}
const SUMI = '#15110e';
const KINARI = '#e2d6b8';
/** 現れては消える縦書きの一行 */
function Line({
  show,
  children,
  className = '',
  style,
  slow = false,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  slow?: boolean;
}) {
  return (
    <div
      aria-hidden={!show}
      className={`tategaki sumi-rough absolute transition-opacity ease-in-out ${slow ? 'duration-[2600ms]' : 'duration-[900ms]'} ${show ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
export function Overlay({ ui, onToggleMute }: OverlayProps) {
  const ascent = ui.phase === Phase.Ascent;
  // 触れる端末か、鍵を持つ端末か。促しの言葉を違える。
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia('(hover: none), (pointer: coarse)').matches);
  }, []);
  // 雲が白いうちは濃墨、汚れてからは生成りの文字
  const onPale = ui.dreadStep <= 1;
  const ink: CSSProperties = {
    color: onPale ? SUMI : KINARI,
    textShadow: onPale ? '0 0 0.7em rgba(239,232,214,0.6)' : '0 0 0.8em rgba(11,9,8,0.85)',
    transition: 'color 1.6s ease, text-shadow 1.6s ease, opacity 0.9s ease',
  };
  const showPrompt = ascent && !ui.holding && ui.height < 2600;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 墨の滲み・かすれを与えるフィルタ */}
      <svg className="absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="sumi-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" result="grain" />
            <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="seal-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="3" result="grain" />
            <feDisplacementMap in="SourceGraphic" in2="grain" scale="3.2" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>
      {/* ── 題字（最初の入力まで） ── */}
      <div
        className={`absolute right-[7vw] top-[9vh] flex flex-row-reverse items-start gap-[1.6vw] transition-opacity duration-[2600ms] ease-in-out ${ui.awakened ? 'opacity-0' : 'opacity-100'}`}
        aria-hidden={ui.awakened}
      >
        <h1
          className="tategaki sumi-rough m-0 font-semibold leading-none"
          style={{ ...ink, fontSize: 'clamp(3.6rem, 15vh, 9.5rem)', letterSpacing: '0.12em' }}
        >
          昇天
        </h1>
        <div className="flex flex-col items-center gap-[2.2vh] pt-[1.5vh]">
          <p
            className="tategaki sumi-rough m-0"
            style={{ ...ink, fontSize: 'clamp(0.8rem, 2.1vh, 1.15rem)', letterSpacing: '0.55em', opacity: 0.82 }}
          >
            雲ヲ抜ケ、仏ニ見ユ
          </p>
          {/* 落款 */}
          <svg viewBox="0 0 40 40" className="h-[clamp(1.9rem,5.2vh,3rem)] w-[clamp(1.9rem,5.2vh,3rem)]" aria-hidden="true">
            <g filter="url(#seal-rough)">
              <rect x="3" y="3" width="34" height="34" fill="#b2311b" opacity="0.92" />
              <text
                x="20"
                y="29.5"
                textAnchor="middle"
                fontSize="25"
                fontWeight="700"
                fill="#eadfc4"
                style={{ fontFamily: 'var(--font-mincho)' }}
              >
                堕
              </text>
            </g>
          </svg>
        </div>
      </div>
      {/* ── 促しの言葉 ── */}
      <div
        className={`absolute left-[9vw] top-1/2 flex -translate-y-1/2 flex-row-reverse items-start gap-[1.2vw] transition-opacity duration-[1400ms] ease-in-out ${showPrompt ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!showPrompt}
      >
        <p
          className="tategaki sumi-rough breath m-0 font-medium"
          style={{ ...ink, fontSize: 'clamp(1.25rem, 3.7vh, 2.1rem)', letterSpacing: '0.5em' }}
        >
          長押しで昇天
        </p>
        <p
          className="tategaki sumi-rough m-0 pt-[0.4em]"
          style={{ ...ink, fontSize: 'clamp(0.68rem, 1.65vh, 0.9rem)', letterSpacing: '0.42em', opacity: 0.7 }}
        >
          {touch ? '画面を押し続けよ' : '空白鍵、あるいは画面を押し続けよ'}
        </p>
      </div>
      {/* ── 手を離した者へ ── */}
      <Line
        show={ui.slipping}
        className="left-[9vw] top-1/2 -translate-y-1/2 font-medium"
        style={{ ...ink, fontSize: 'clamp(1.1rem, 3.2vh, 1.8rem)', letterSpacing: '0.55em' }}
      >
        離せば、堕ちる
      </Line>
      {/* ── 高さ ── */}
      <Line
        show={ui.awakened && ui.height > 0}
        className="bottom-[7vh] left-[4.2vw]"
        style={{ ...ink, fontSize: 'clamp(0.72rem, 1.9vh, 1rem)', letterSpacing: '0.4em', opacity: undefined }}
      >
        <span style={{ opacity: 0.62 }}>高サ</span>
        <span className="inline-block py-[0.6em] tabular-nums">{toKanji(ui.height)}</span>
        <span style={{ opacity: 0.62 }}>丈</span>
      </Line>
      {/* ── 審判 ── */}
      <Line
        show={ui.verdict}
        className="tremble right-[6vw] top-[8vh] font-bold leading-none"
        style={{
          color: '#a51b12',
          fontSize: 'clamp(3rem, 14vh, 8.5rem)',
          letterSpacing: '0.14em',
          textShadow: '0 0 0.12em #0b0908, 0.03em 0.04em 0 #0b0908, 0 0 0.9em rgba(11,9,8,0.9)',
        }}
      >
        汝、堕獄
      </Line>
      {/* ── 審判の間 ── */}
      <Line
        show={ui.condemned}
        slow
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ ...ink, color: onPale ? SUMI : KINARI, fontSize: 'clamp(0.85rem, 2.3vh, 1.25rem)', letterSpacing: '0.75em', opacity: ui.condemned ? 0.55 : 0 }}
      >
        見られておる
      </Line>
      {/* ── 闇の底 ── */}
      <Line
        show={ui.epitaph}
        slow
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ color: KINARI, fontSize: 'clamp(0.95rem, 2.6vh, 1.4rem)', letterSpacing: '0.9em', opacity: ui.epitaph ? 0.5 : 0 }}
      >
        また、昇るか
      </Line>
      {/* ── 音の有無（Ｍ） ── */}
      <button
        type="button"
        data-no-hold
        onClick={onToggleMute}
        tabIndex={ascent && ui.awakened ? 0 : -1}
        aria-label={ui.muted ? '音を出す' : '音を消す'}
        aria-pressed={ui.muted}
        className={`tategaki sumi-rough absolute bottom-[7vh] right-[3.6vw] m-0 cursor-pointer appearance-none border-0 bg-transparent p-[0.4em] transition-opacity duration-[1400ms] ${ascent && ui.awakened ? 'pointer-events-auto opacity-55 hover:opacity-100 focus-visible:opacity-100' : 'opacity-0'}`}
        style={{ ...ink, fontSize: 'clamp(0.68rem, 1.7vh, 0.92rem)', letterSpacing: '0.45em' }}
      >
        <span>音</span>
        <span className="inline-block pt-[0.5em]">{ui.muted ? '無' : '有'}</span>
      </button>
    </div>
  );
}
