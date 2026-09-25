export type InputAction = 'left' | 'right' | 'up' | 'down' | 'deliver';

type Listener = (action: InputAction) => void;

/**
 * Keyboard + on-screen touch controls (D-pad and a deliver button), unified
 * behind a single callback so Game doesn't care which input fired.
 */
export class InputController {
  private listeners: Listener[] = [];
  private keyDown = new Set<string>();
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', this.onKeyDown);
    this.buildTouchControls();
  }

  onAction(fn: Listener) {
    this.listeners.push(fn);
  }

  private emit(action: InputAction) {
    for (const l of this.listeners) l(action);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.keyDown.has(e.code)) return; // ignore auto-repeat
    this.keyDown.add(e.code);
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.emit('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.emit('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.emit('up');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.emit('down');
        break;
      case 'Space':
      case 'Enter':
        e.preventDefault();
        this.emit('deliver');
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keyDown.delete(e.code);
  };

  private buildTouchControls() {
    window.addEventListener('keyup', this.onKeyUp);

    const wrap = document.createElement('div');
    wrap.className = 'touch-controls';
    wrap.innerHTML = `
      <div class="dpad">
        <button class="dpad-btn dpad-up" data-action="up" aria-label="Fly up">▲</button>
        <div class="dpad-row">
          <button class="dpad-btn dpad-left" data-action="left" aria-label="Move left">◀</button>
          <button class="dpad-btn dpad-down" data-action="down" aria-label="Fly down">▼</button>
          <button class="dpad-btn dpad-right" data-action="right" aria-label="Move right">▶</button>
        </div>
      </div>
      <button class="deliver-btn" data-action="deliver" aria-label="Deliver gift">🎁</button>
    `;
    this.root.appendChild(wrap);

    wrap.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      const action = btn.dataset.action as InputAction;
      const fire = (ev: Event) => {
        ev.preventDefault();
        this.emit(action);
      };
      btn.addEventListener('pointerdown', fire, { passive: false });
    });

    // Swipe gestures anywhere on the canvas area as an alternative to the dpad.
    let touchStartX = 0;
    let touchStartY = 0;
    let touchActive = false;
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as HTMLElement).closest('button, .hud, .screen')) return;
        touchActive = true;
        touchStartX = e.clientX;
        touchStartY = e.clientY;
      },
      { passive: true },
    );
    this.root.addEventListener(
      'pointerup',
      (e) => {
        if (!touchActive) return;
        touchActive = false;
        const dx = e.clientX - touchStartX;
        const dy = e.clientY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const threshold = 28;
        if (Math.max(absX, absY) < threshold) return;
        if (absX > absY) {
          this.emit(dx > 0 ? 'right' : 'left');
        } else {
          this.emit(dy > 0 ? 'down' : 'up');
        }
      },
      { passive: true },
    );
  }
}
