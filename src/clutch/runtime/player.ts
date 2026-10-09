// Input do jogador: Pointer Lock + WASD + mouse. Produz um SimInput por tick.
import { NO_INPUT, type SimInput } from '../logic/sim';

export interface PlayerInput {
  sample(): SimInput;
  locked(): boolean;
  lock(): void;
  setView(yaw: number, pitch: number): void;
  dispose(): void;
}

const SENS = 0.0022;

export function createPlayerInput(canvas: HTMLCanvasElement, onUnlockEsc: () => void, onLockChange: (l: boolean) => void): PlayerInput {
  const keys = new Set<string>();
  let fire = false;
  let yaw = 0, pitch = 0;
  let switchTo: SimInput['switchTo'] = null;
  let escArmed = false;

  const isLocked = () => document.pointerLockElement === canvas;
  const onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.code;
    if (k === 'Escape' && down && !isLocked()) {
      // Esc com o mouse já solto (o primeiro Esc soltou o pointer lock) = desistir
      if (escArmed) onUnlockEsc();
      return;
    }
    if (!isLocked()) return;
    if (down) keys.add(k); else keys.delete(k);
    if (down && (k === 'Digit1')) switchTo = 'rifle';
    if (down && (k === 'Digit2')) switchTo = 'pistol';
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) e.preventDefault();
  };
  const kd = (e: KeyboardEvent) => onKey(e, true);
  const ku = (e: KeyboardEvent) => onKey(e, false);
  const mm = (e: MouseEvent) => {
    if (!isLocked()) return;
    yaw -= e.movementX * SENS;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * SENS));
  };
  const md = (e: MouseEvent) => { if (isLocked() && e.button === 0) fire = true; };
  const mu = (e: MouseEvent) => { if (e.button === 0) fire = false; };
  const plc = () => {
    const l = isLocked();
    if (!l) { keys.clear(); fire = false; escArmed = true; } else escArmed = false;
    onLockChange(l);
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  document.addEventListener('mousemove', mm);
  document.addEventListener('mousedown', md);
  document.addEventListener('mouseup', mu);
  document.addEventListener('pointerlockchange', plc);

  return {
    sample() {
      const s: SimInput = {
        ...NO_INPUT,
        fwd: keys.has('KeyW'), back: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'),
        walk: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space'),
        fire, use: keys.has('KeyE'), reload: keys.has('KeyR'),
        yaw, pitch, switchTo,
      };
      switchTo = null;
      return s;
    },
    locked: isLocked,
    lock() {
      try {
        const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch { /* sem pointer lock (iframe/headless) */ }
    },
    setView(y, p) { yaw = y; pitch = p; },
    dispose() {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mousedown', md);
      document.removeEventListener('mouseup', mu);
      document.removeEventListener('pointerlockchange', plc);
      if (isLocked()) document.exitPointerLock();
    },
  };
}
