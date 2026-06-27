// LockerRoomPageHost — T10.2. Host global pattern.

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { LockerRoomPage, type LockerRoomData } from '../pages/LockerRoomPage';

interface State {
  data: LockerRoomData;
  onReady?: () => void;
}

type Listener = (next: State | null) => void;
const listeners = new Set<Listener>();
let current: State | null = null;

function setAll(next: State | null): void {
  current = next;
  for (const l of listeners) l(next);
}

export function openLockerRoom(data: LockerRoomData, onReady?: () => void): void {
  setAll({ data, onReady });
}

export function LockerRoomPageHost() {
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
    <Modal open={state != null} onClose={close} title={state?.data.title ?? 'Vestiário'} size="lg">
      {state && (
        <LockerRoomPage
          data={state.data}
          onClose={close}
          onReady={state.onReady && (() => {
            state.onReady?.();
            close();
          })}
        />
      )}
    </Modal>
  );
}
