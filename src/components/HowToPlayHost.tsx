// HowToPlayHost — T8.1 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Host global do tutorial. Pattern idêntico a ConfirmDialogHost/PatchNotesHost:
// state module-level + listeners + função imperativa `openHowToPlay()` que
// qualquer parte do app pode chamar (sem precisar prop drilling).

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { HowToPlay } from '../pages/HowToPlay';

type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let openState = false;

function setOpenAll(next: boolean): void {
  openState = next;
  for (const l of listeners) l(next);
}

/** API pública: abre o tutorial. Pode ser chamada de qualquer lugar. */
export function openHowToPlay(): void {
  setOpenAll(true);
}

/** Host único — monta no main.tsx perto da raiz. */
export function HowToPlayHost() {
  const [open, setOpen] = useState(openState);

  useEffect(() => {
    const l: Listener = (next) => setOpen(next);
    listeners.add(l);
    if (openState !== open) setOpen(openState);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => setOpenAll(false);

  return (
    <Modal open={open} onClose={close} title="Como jogar" size="lg">
      <HowToPlay onClose={close} />
    </Modal>
  );
}
