// Háptico via navigator.vibrate, com um padrão por evento. No-op onde não
// existe (iOS Safari, desktop) e quando o jogador desligou ou o sistema pede
// menos movimento (ver prefs.ts). Os padrões são dados puros (ms de vibração,
// pausa, vibração…) para ficarem testáveis e fáceis de afinar.

import { isHapticsOn, juicePrefs, prefersReducedMotion } from './prefs';

export type HapticEvent =
  | 'tap'         // toque leve de UI
  | 'lockIn'      // escolha travada — o mais usado (UX-07: vibrate nos lock-ins)
  | 'reveal'      // carta revelada (use `tier` em hapticPattern)
  | 'win'
  | 'loss'
  | 'achievement'
  | 'timerTick'
  | 'error';

/** Padrão por evento. Somas curtas: vibração longa irrita e gasta bateria. */
export const HAPTIC_PATTERNS: Readonly<Record<HapticEvent, readonly number[]>> = {
  tap: [8],
  lockIn: [20],
  reveal: [12, 40, 24],
  win: [18, 60, 18, 60, 40],
  loss: [60],
  achievement: [25, 50, 25, 50, 70],
  timerTick: [6],
  error: [30, 40, 30],
};

/** Teto de duração total (ms) de qualquer padrão, por segurança. */
export const HAPTIC_MAX_TOTAL_MS = 400;

/**
 * Padrão final de um evento. No reveal, o tier (0..4) acrescenta pulsos:
 * carta comum dá um toque, lendária dá uma batida crescente.
 */
export function hapticPattern(event: HapticEvent, tier = 0): number[] {
  let p = [...HAPTIC_PATTERNS[event]];
  if (event === 'reveal') {
    const t = Math.max(0, Math.min(4, Math.trunc(tier)));
    for (let i = 0; i < t; i++) p.push(40, 14 + i * 8);
  }
  // Corta no teto preservando a alternância vibração/pausa.
  let total = 0;
  const out: number[] = [];
  for (const ms of p) {
    if (total + ms > HAPTIC_MAX_TOTAL_MS) break;
    out.push(ms);
    total += ms;
  }
  p = out;
  // Padrão terminando em pausa é inútil.
  if (p.length % 2 === 0) p.pop();
  return p;
}

type VibrateFn = (pattern: number | number[]) => boolean;

function vibrateFn(): VibrateFn | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { vibrate?: VibrateFn };
  return typeof nav.vibrate === 'function' ? nav.vibrate.bind(nav) : null;
}

/** true se o aparelho suporta vibração (independe da preferência). */
export function hapticsSupported(): boolean {
  return vibrateFn() !== null;
}

/** Dispara o háptico do evento. Nunca lança. Devolve true se vibrou. */
export function haptic(event: HapticEvent, tier = 0): boolean {
  if (!isHapticsOn(juicePrefs.get(), prefersReducedMotion())) return false;
  const vib = vibrateFn();
  if (!vib) return false;
  try {
    return vib(hapticPattern(event, tier));
  } catch {
    return false;
  }
}
