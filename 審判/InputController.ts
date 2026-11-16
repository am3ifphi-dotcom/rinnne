/**
 * ui/InputController — 入力の正規化。
 *
 * Space キーの長押し（および、キーボードを持たない端末のための画面長押し）を
 * 「押している／離した」の二値に畳み込んで通知する。
 * どの局面で入力が有効かは関知しない（それは Timeline の責務）。
 */
export interface InputHandlers {
  onHold(on: boolean): void;
  onToggleMute(): void;
}
export class InputController {
  private keyDown = false;
  private pointerDown = false;
  private held = false;
  constructor(
    private readonly surface: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('contextmenu', this.prevent);
  }
  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('contextmenu', this.prevent);
  }
  private sync(): void {
    const next = this.keyDown || this.pointerDown;
    if (next === this.held) return;
    this.held = next;
    this.handlers.onHold(next);
  }
  private readonly prevent = (e: Event): void => e.preventDefault();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      // 押しっぱなしのキーリピートは無視する。局面が変わったら押し直しが必要。
      if (e.repeat) return;
      this.keyDown = true;
      this.sync();
    } else if (e.code === 'KeyM' && !e.repeat) {
      this.handlers.onToggleMute();
    }
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this.keyDown = false;
      this.sync();
    }
  };
  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest('[data-no-hold]')) return;
    this.pointerDown = true;
    this.sync();
  };
  private readonly onPointerUp = (): void => {
    this.pointerDown = false;
    this.sync();
  };
  private readonly releaseAll = (): void => {
    this.keyDown = false;
    this.pointerDown = false;
    this.sync();
  };
}
