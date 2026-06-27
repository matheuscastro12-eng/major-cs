// InfrastructurePageHost — T10.1. Host global pattern.

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { InfrastructurePage } from '../pages/InfrastructurePage';
import type { Facilities, FacilityKey } from '../engine/career/facilities';

interface State {
  facilities: Facilities;
  budget: number;
  onUpgrade: (key: FacilityKey) => void;
}

type Listener = (next: State | null) => void;
const listeners = new Set<Listener>();
let current: State | null = null;

function setAll(next: State | null): void {
  current = next;
  for (const l of listeners) l(next);
}

export function openInfrastructure(input: State): void {
  setAll(input);
}

/** Atualiza o estado SE o modal já está aberto (pro caller refletir o upgrade). */
export function refreshInfrastructure(input: State): void {
  if (current) setAll(input);
}

export function InfrastructurePageHost() {
  const [state, setState] = useState<State | null>(current);

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
    <Modal open={state != null} onClose={close} title="Infraestrutura" size="lg">
      {state && (
        <InfrastructurePage
          facilities={state.facilities}
          budget={state.budget}
          onUpgrade={(key) => state.onUpgrade(key)}
          onClose={close}
        />
      )}
    </Modal>
  );
}
