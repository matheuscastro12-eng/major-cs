// Timer da bomba e defuse (puro). Defuse 5 s sem kit; reinicia ao soltar E ou andar.
export const DEFUSE_S = 5;
export const DEFUSE_RANGE_M = 1.5;

export interface BombState {
  timeLeft: number;
  defuse: number;        // segundos acumulados
  defusing: boolean;
  defused: boolean;
  exploded: boolean;
  nextBeep: number;      // segundos até o próximo bip
}

export function createBomb(timeLeft = 40): BombState {
  return { timeLeft, defuse: 0, defusing: false, defused: false, exploded: false, nextBeep: 0 };
}

/** bip acelera: 1 s com 30 s+ restantes, até 0,12 s no fim */
export function beepInterval(timeLeft: number): number {
  return Math.max(0.12, Math.min(1, timeLeft / 30));
}

export interface DefuseInput { holding: boolean; inRange: boolean; moving: boolean }

export type BombEvent = 'beep' | 'defuse_start' | 'defuse_cancel' | 'defused' | 'exploded';

export function stepBomb(b: BombState, dt: number, inp: DefuseInput): BombEvent[] {
  const ev: BombEvent[] = [];
  if (b.defused || b.exploded) return ev;
  const can = inp.holding && inp.inRange && !inp.moving;
  if (can) {
    if (!b.defusing) ev.push('defuse_start');
    b.defusing = true;
    b.defuse += dt;
  } else if (b.defusing) {
    b.defusing = false;
    b.defuse = 0;
    ev.push('defuse_cancel');
  }
  b.timeLeft -= dt;
  // explosão vence se o tempo acaba antes de o defuse completar
  if (b.timeLeft <= 1e-9) {
    b.timeLeft = 0;
    b.exploded = true;
    b.defusing = false;
    ev.push('exploded');
    return ev;
  }
  if (b.defuse >= DEFUSE_S - 1e-9) {
    b.defused = true;
    b.defusing = false;
    ev.push('defused');
    return ev;
  }
  b.nextBeep -= dt;
  if (b.nextBeep <= 0) {
    ev.push('beep');
    b.nextBeep = beepInterval(b.timeLeft);
  }
  return ev;
}
