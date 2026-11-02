// [Major espetáculo] Pick'em persistido por navegador (fora do save da Carreira:
// é só apresentação, não mexe em resultado nem no tamanho do save).
import { useCallback, useState } from 'react';
import type { Pairing, Tournament } from '../../../types';
import { addPick, emptyBook, gradePicks, hubPicks, type HistoryItem, type PickemBook, type PickemGrade } from './logic';

const keyOf = (org: string, split: number) => `rtm-major-pickem:${org}:${split}`;

export function loadBook(org: string, split: number): PickemBook {
  try {
    const raw = localStorage.getItem(keyOf(org, split));
    const b = raw ? (JSON.parse(raw) as PickemBook) : null;
    return b && typeof b.picks === 'object' ? b : emptyBook();
  } catch { return emptyBook(); }
}
function saveBook(org: string, split: number, b: PickemBook): void {
  try { localStorage.setItem(keyOf(org, split), JSON.stringify(b)); } catch { /* sem storage: vale na sessão */ }
}

export interface MajorPickem {
  grade: PickemGrade;
  hub: { picks: Record<string, string>; score: number; total: number };
  onPick: (key: string, teamId: string) => void;
}

export function useMajorPickem(t: Tournament, stage: number, history: HistoryItem[], org: string, split: number): MajorPickem {
  const [book, setBook] = useState<PickemBook>(() => loadBook(org, split));
  const grade = gradePicks(book, history);
  const onPick = useCallback((key: string, teamId: string) => {
    const [a, b] = key.split('|');
    const p: Pairing | undefined = t.pairings.find((x) => x.a === a && x.b === b);
    if (!p) return;
    setBook((cur) => { const n = addPick(cur, stage, p, teamId, history); if (n !== cur) saveBook(org, split, n); return n; });
  }, [t, stage, history, org, split]);
  return { grade, hub: { picks: hubPicks(book, stage, t.pairings), score: grade.score, total: grade.total }, onPick };
}
