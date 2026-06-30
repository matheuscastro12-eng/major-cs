// CoachProfileHost — host global pra abrir o perfil de carreira do treinador.

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { CoachProfilePage } from '../pages/CoachProfilePage';
import type { ComponentProps } from 'react';

type Input = Omit<ComponentProps<typeof CoachProfilePage>, 'onClose'>;

type Listener = (next: Input | null) => void;
const listeners = new Set<Listener>();
let current: Input | null = null;

function setAll(next: Input | null): void {
  current = next;
  for (const l of listeners) l(next);
}

export function openCoachProfile(input: Input): void {
  setAll(input);
}

export function CoachProfileHost() {
  const [data, setData] = useState<Input | null>(current);
  useEffect(() => {
    const l: Listener = (next) => setData(next);
    listeners.add(l);
    if (current !== data) setData(current);
    return () => { listeners.delete(l); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => setAll(null);
  return (
    <Modal open={data != null} onClose={close} title="Perfil do treinador" size="lg">
      {data && <CoachProfilePage {...data} onClose={close} />}
    </Modal>
  );
}
