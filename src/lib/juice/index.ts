// Juice kit — som, háptico, confete e View Transitions (ULTRAPLAN §4,
// princípio 6; UX-07). Documentação: docs/design-system.md, seção "Juice".
//
// Uso típico numa tela:
//   import { juice, celebrate } from '../../lib/juice';
//   juice('lockIn');                         // som + vibração da escolha
//   juice('reveal', { tier: 4 });            // walkout de carta lendária
//   juice('achievement'); celebrate({ origin: trophyEl });

import { playSfx, type RevealTier, type SfxName, type SfxOptions } from './sfx';
import { haptic, type HapticEvent } from './haptics';

export * from './prefs';
export * from './sfx';
export * from './haptics';
export * from './celebrate';
export * from './viewTransition';
export { useJuicePrefs, type JuicePrefsView } from './useJuicePrefs';
export { SoundToggle, type SoundToggleProps } from './SoundToggle';

/** Háptico correspondente a cada SFX (click → tap; o resto tem o mesmo nome). */
const SFX_TO_HAPTIC: Record<SfxName, HapticEvent> = {
  click: 'tap',
  lockIn: 'lockIn',
  reveal: 'reveal',
  win: 'win',
  loss: 'loss',
  achievement: 'achievement',
  timerTick: 'timerTick',
  error: 'error',
};

export interface JuiceOptions extends SfxOptions {
  /** false = só som, sem vibrar (ex.: click de hover). Padrão true. */
  haptic?: boolean;
}

/** Som + háptico do evento numa chamada. Nunca lança; respeita mute e reduced-motion. */
export function juice(name: SfxName, opts: JuiceOptions = {}): void {
  playSfx(name, opts);
  if (opts.haptic !== false) haptic(SFX_TO_HAPTIC[name], opts.tier ?? 0);
}

export type { RevealTier };
