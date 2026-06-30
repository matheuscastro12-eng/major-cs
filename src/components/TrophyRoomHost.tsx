// TrophyRoomHost — host global pra abrir a Sala de Troféus de qualquer lugar.
// Mesmo pattern do MetaPageHost.

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { TrophyRoomPage } from '../pages/TrophyRoomPage';
import type { ComponentProps } from 'react';

type Input = Omit<ComponentProps<typeof TrophyRoomPage>, 'onClose'>;

type Listener = (next: Input | null) => void;
const listeners = new Set<Listener>();
let current: Input | null = null;

function setAll(next: Input | null): void {
  current = next;
  for (const l of listeners) l(next);
}

export function openTrophyRoom(input: Input): void {
  setAll(input);
}

export function TrophyRoomHost() {
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
    <Modal open={data != null} onClose={close} title="Sala de troféus" size="lg">
      {data && <TrophyRoomPage {...data} onClose={close} />}
    </Modal>
  );
}
