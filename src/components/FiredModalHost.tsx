// FiredModalHost — T11.5. Host global pattern.

import { useEffect, useState } from 'react';
import { FiredModal, type FiredModalData } from './FiredModal';

type State = { data: FiredModalData; onRestart: () => void } | null;
type Listener = (next: State) => void;

const listeners = new Set<Listener>();
let current: State = null;

function setAll(next: State): void {
  current = next;
  for (const l of listeners) l(next);
}

export function openFiredModal(data: FiredModalData, onRestart: () => void): void {
  setAll({ data, onRestart });
}

export function FiredModalHost() {
  const [state, setState] = useState<State>(current);

  useEffect(() => {
    const l: Listener = (next) => setState(next);
    listeners.add(l);
    if (current !== state) setState(current);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => setAll(null);
  return (
    <FiredModal
      data={state?.data ?? null}
      onClose={close}
      onRestart={() => {
        state?.onRestart();
        close();
      }}
    />
  );
}
