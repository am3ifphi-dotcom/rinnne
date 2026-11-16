/**
 * App — UI 層の入口。
 * キャンバスと言葉のオーバーレイを置き、Experience（合成ルート）と
 * InputController を生成・破棄するだけの薄い殻。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Experience, INITIAL_UI, type UiSnapshot } from './app/Experience';
import { Phase } from './state/types';
import { InputController } from './ui/InputController';
import { Overlay } from './ui/Overlay';
export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<Experience | null>(null);
  const [ui, setUi] = useState<UiSnapshot>(INITIAL_UI);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    let experience: Experience;
    try {
      experience = new Experience(canvas);
    } catch {
      setFailed(true);
      return;
    }
    experienceRef.current = experience;
    const unsubscribe = experience.subscribeUi(setUi);
    const input = new InputController(root, {
      onHold: (on) => experience.setHolding(on),
      onToggleMute: () => experience.toggleMute(),
    });
    return () => {
      input.dispose();
      unsubscribe();
      experience.dispose();
      experienceRef.current = null;
    };
  }, []);
  const toggleMute = useCallback(() => experienceRef.current?.toggleMute(), []);
  // 仏の前では指し示すものを持たない
  const hideCursor = ui.awakened && ui.phase !== Phase.Ascent;
  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 touch-none overflow-hidden bg-[#0b0908] select-none ${hideCursor ? 'cursor-none' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label="渦巻く雲の底から見上げた空。長押しで雲の穴へ昇っていく。"
      />
      {failed ? (
        <p
          className="tategaki absolute left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2"
          style={{ color: '#e2d6b8', fontSize: '1.2rem', letterSpacing: '0.6em' }}
        >
          この端末では、描けぬ
        </p>
      ) : (
        <Overlay ui={ui} onToggleMute={toggleMute} />
      )}
    </div>
  );
}
