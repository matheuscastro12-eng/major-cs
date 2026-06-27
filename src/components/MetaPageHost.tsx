// MetaPageHost — T9.2. Host global pra abrir MetaPage de qualquer lugar.
// Pattern idêntico aos outros hosts (HowToPlayHost / ConfirmDialogHost).

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { MetaPage } from '../pages/MetaPage';
import type { ComponentProps } from 'react';

type MetaInput = ComponentProps<typeof MetaPage>;

type Listener = (next: MetaInput | null) => void;
const listeners = new Set<Listener>();
let current: MetaInput | null = null;

function setAll(next: MetaInput | null): void {
  current = next;
  for (const l of listeners) l(next);
}

/** API pública: abre o modal de Meta passando todos os agregados. */
export function openMeta(input: Omit<MetaInput, 'onClose'>): void {
  setAll({ ...input, onClose: () => setAll(null) });
}

export function MetaPageHost() {
  const [data, setData] = useState<MetaInput | null>(current);

  useEffect(() => {
    const l: Listener = (next) => setData(next);
    listeners.add(l);
    if (current !== data) setData(current);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => setAll(null);
  return (
    <Modal open={data != null} onClose={close} title="Meta" size="lg">
      {data && <MetaPage {...data} />}
    </Modal>
  );
}
