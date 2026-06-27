// CompareHost — T9.1 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Host global pra abrir a ComparePage de qualquer lugar via `openCompare(players)`.
// Mesmo pattern de HowToPlayHost / ConfirmDialogHost (module-level state + listeners).

import { useEffect, useState } from 'react';
import { Modal } from './ds';
import { ComparePage } from '../pages/ComparePage';
import type { Player } from '../types';

type Listener = (next: Player[] | null) => void;
const listeners = new Set<Listener>();
let current: Player[] | null = null;

function setAll(next: Player[] | null): void {
  current = next;
  for (const l of listeners) l(next);
}

/** API pública: abre o modal de comparação com 2-4 players. */
export function openCompare(players: Player[]): void {
  const filtered = players.slice(0, 4);
  if (filtered.length === 0) return;
  setAll(filtered);
}

export function CompareHost() {
  const [players, setPlayers] = useState<Player[] | null>(current);

  useEffect(() => {
    const l: Listener = (next) => setPlayers(next);
    listeners.add(l);
    if (current !== players) setPlayers(current);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => setAll(null);
  const open = players != null;

  return (
    <Modal open={open} onClose={close} title="Comparação de jogadores" size="lg">
      {players && <ComparePage players={players} onClose={close} />}
    </Modal>
  );
}
