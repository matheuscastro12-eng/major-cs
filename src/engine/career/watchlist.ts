// WATCHLIST COM SCOUTING PROGRESSIVO (#41 do gap Brasval). Puro, sem React.
//
// O loop "marquei esse moleque, mande olheiro, a cada relatório eu sei mais":
// você adiciona qualquer jogador de fora do elenco à lista de atenção e o
// conhecimento ACUMULA por alvo — a cada fechamento de split o nível de
// revelação sobe (com olheiro contratado: todo split; sem: split sim, split não).
//
//   Nível 1 — faixa larga de OVR (±6) + função
//   Nível 2 — faixa média (±3) + personalidade
//   Nível 3 — faixa fina (±1) + sub-função
//   Nível 4 — OVR exato + POTENCIAL revelado
//
// O "OVR aparente" tem ruído DETERMINÍSTICO por (jogador, nível) — dois saves
// veem o mesmo relatório, e o número não dança a cada render.

import { hashStr } from '../../state/hash';

export const REVEAL_MAX = 4;

export interface WatchlistEntry {
  playerId: string;
  nick: string;
  addedAtSplit: number;
  revealLevel: number;        // 1..REVEAL_MAX
  lastReportSplit: number;    // último split em que o nível subiu
}

export interface WatchReveal {
  ovrBand: number;            // ± no OVR aparente (0 = exato)
  showPersonality: boolean;
  showSubRole: boolean;
  showPotential: boolean;
}

export function revealOf(level: number): WatchReveal {
  const l = Math.max(1, Math.min(REVEAL_MAX, Math.round(level)));
  return {
    ovrBand: l >= 4 ? 0 : l === 3 ? 1 : l === 2 ? 3 : 6,
    showPersonality: l >= 2,
    showSubRole: l >= 3,
    showPotential: l >= 4,
  };
}

// OVR aparente: real + ruído determinístico DENTRO da banda do nível. O ruído
// por (jogador, nível) é fixo — o relatório não muda de opinião sozinho.
export function apparentOvr(realOvr: number, playerId: string, level: number): number {
  const band = revealOf(level).ovrBand;
  if (band <= 0) return realOvr;
  const noise = (hashStr(`watch:${playerId}:${level}`) % (band * 2 + 1)) - band;
  return Math.max(40, Math.min(99, realOvr + noise));
}

export function addToWatchlist(list: WatchlistEntry[] | undefined, playerId: string, nick: string, split: number): WatchlistEntry[] {
  const cur = list ?? [];
  if (cur.some((w) => w.playerId === playerId)) return cur;
  return [...cur, { playerId, nick, addedAtSplit: split, revealLevel: 1, lastReportSplit: split }];
}

export function removeFromWatchlist(list: WatchlistEntry[] | undefined, playerId: string): WatchlistEntry[] {
  return (list ?? []).filter((w) => w.playerId !== playerId);
}

export function watchOf(list: WatchlistEntry[] | undefined, playerId: string): WatchlistEntry | null {
  return (list ?? []).find((w) => w.playerId === playerId) ?? null;
}

// Tick do fechamento: o conhecimento sobe. Com olheiro contratado: +1 nível por
// split. Sem olheiro: +1 a cada 2 splits (você mesmo assistindo demos).
export function tickWatchlist(list: WatchlistEntry[] | undefined, split: number, hasScout: boolean): WatchlistEntry[] {
  return (list ?? []).map((w) => {
    if (w.revealLevel >= REVEAL_MAX) return w;
    const due = hasScout || split - w.lastReportSplit >= 2;
    return due ? { ...w, revealLevel: w.revealLevel + 1, lastReportSplit: split } : w;
  });
}
