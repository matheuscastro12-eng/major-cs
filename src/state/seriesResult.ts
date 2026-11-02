// Números do resultado da série (SeriesResult.tsx). Só lê o SeriesResult:
// o destaque da partida segue a mesma regra do Scoreboard.
import { computeDisplay, mergeLines } from '../engine/match';
import type { SeriesResult, TTeam } from '../types';

export const TACTICAL_NEXT_KEY = 'rtm.tactical-next';

export type Potm = { team: 0 | 1; nick: string; rating: number };

/** maior rating da série; `only` restringe a um time (mesma regra do Scoreboard) */
export function seriesPotm(series: SeriesResult, teams: [TTeam, TTeam], only?: 0 | 1): Potm | null {
  let best: Potm | null = null;
  for (const idx of [0, 1] as const) {
    if (only != null && idx !== only) continue;
    for (const p of [...teams[idx].players, ...(teams[idx].bench ?? [])]) {
      const line = mergeLines(series.maps.map((m) => m.stats[p.id]).filter(Boolean).map((s) => s.both));
      if (line.rounds === 0) continue;
      const rating = computeDisplay(line).rating;
      if (!best || rating > best.rating) best = { team: idx, nick: p.nick, rating };
    }
  }
  return best;
}

/** maior sequência de rounds seguidos do time do jogador na série */
export function bestRunOf(series: SeriesResult, userIdx: 0 | 1): number {
  let best = 0;
  for (const m of series.maps) {
    let run = 0;
    for (const w of m.roundLog) {
      if (w === userIdx) { run++; if (run > best) best = run; } else run = 0;
    }
  }
  return best;
}

/** o convite do fim de série liga o Tático só na próxima partida (uma vez) */
export function readTacticalNext(): boolean {
  try { return localStorage.getItem(TACTICAL_NEXT_KEY) === '1'; } catch { return false; }
}
export function clearTacticalNext(): void {
  try { localStorage.removeItem(TACTICAL_NEXT_KEY); } catch { /* sem storage */ }
}

