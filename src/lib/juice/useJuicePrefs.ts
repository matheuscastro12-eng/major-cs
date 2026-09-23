// Hook React das preferências do juice. useSyncExternalStore mantém todos os
// SoundToggle (e qualquer tela que leia `muted`) em sincronia sem Zustand.

import { useSyncExternalStore } from 'react';
import { isEffectivelyMuted, isHapticsOn, juicePrefs, prefersReducedMotion, type JuicePrefs } from './prefs';

export interface JuicePrefsView extends JuicePrefs {
  /** Mudo de fato (resolve "segue o sistema" e volume 0). */
  soundOff: boolean;
  /** Háptico ligado de fato. */
  hapticsActive: boolean;
}

// Servidor/prerender: sempre o mesmo snapshot (padrão), sem storage.
const serverSnapshot = (): JuicePrefs => juicePrefs.get();

export function useJuicePrefs(): JuicePrefsView {
  const prefs = useSyncExternalStore(juicePrefs.subscribe, juicePrefs.get, serverSnapshot);
  const reduced = prefersReducedMotion();
  return {
    ...prefs,
    soundOff: isEffectivelyMuted(prefs, reduced),
    hapticsActive: isHapticsOn(prefs, reduced),
  };
}
