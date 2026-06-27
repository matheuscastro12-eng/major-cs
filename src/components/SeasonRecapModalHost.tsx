// SeasonRecapModalHost — host global pra disparar SeasonRecapModal de qualquer
// ponto do CareerScreen (fim de split, pós-Major, etc).

import { useEffect, useState } from 'react';
import { SeasonRecapModal, type SeasonRecapData } from './SeasonRecapModal';

// Re-exporta o type pro caller consumir sem importar do componente direto.
export type { SeasonRecapData } from './SeasonRecapModal';

type Listener = (next: SeasonRecapData | null) => void;
const listeners = new Set<Listener>();
let current: SeasonRecapData | null = null;
let onCloseCb: (() => void) | null = null;

function setAll(next: SeasonRecapData | null): void {
  current = next;
  for (const l of listeners) l(next);
}

/** Abre o recap; quando user fechar (ou pular), chama onClose pra encadear próximos passos. */
export function openSeasonRecap(data: SeasonRecapData, onClose?: () => void): void {
  onCloseCb = onClose ?? null;
  setAll(data);
}

export function SeasonRecapModalHost() {
  const [state, setState] = useState<SeasonRecapData | null>(current);

  useEffect(() => {
    const l: Listener = (next) => setState(next);
    listeners.add(l);
    if (current !== state) setState(current);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    const cb = onCloseCb;
    onCloseCb = null;
    setAll(null);
    cb?.();
  };

  return <SeasonRecapModal data={state} onClose={close} />;
}
