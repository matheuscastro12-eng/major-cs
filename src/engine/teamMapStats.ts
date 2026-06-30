// Histórico REAL de desempenho por mapa do time do usuário, acumulado na carreira.
//
// O save guarda `mapStats: Record<MapId, {w,l,rf,ra}>` — vitórias/derrotas e
// rounds pró/contra POR MAPA, somados em cada série jogada (recordCareerMatch).
// Este módulo é puro/determinístico: transforma esse acumulado em linhas prontas
// pra UI (tabela "Desempenho por mapa") e num contexto que o veto da IA usa pra
// banir os seus mapas fortes e te dar de pick os fracos — memória real da run.

import type { MapId } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';

export interface MapStatRec { w: number; l: number; rf: number; ra: number; }

export interface MapPerfRow {
  map: MapId;
  label: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;   // 0..100
  roundDiff: number; // rf - ra
  inPool: boolean;   // está no pool ativo de mapas do CS2
}

// amostra mínima pra um win-rate por mapa pesar no veto da IA (evita banir um
// mapa por causa de 1 jogo de sorte).
export const VETO_MIN_GAMES = 2;

// agrega o acumulado em linhas ordenadas (pool ativo primeiro, depois win-rate↓).
// Inclui mapas do pool mesmo sem jogos (games=0) pra a tabela ficar completa.
export function computeMapPerformance(
  mapStats: Record<string, MapStatRec> | undefined,
  pool: readonly MapId[] = MAP_POOL,
): MapPerfRow[] {
  const ms = mapStats ?? {};
  const keys = new Set<string>([...Object.keys(ms), ...pool]);
  const rows: MapPerfRow[] = [];
  for (const k of keys) {
    const r = ms[k];
    const wins = r?.w ?? 0;
    const losses = r?.l ?? 0;
    const games = wins + losses;
    rows.push({
      map: k as MapId,
      label: MAP_LABELS[k] ?? k,
      games,
      wins,
      losses,
      winRate: games ? (wins / games) * 100 : 0,
      roundDiff: (r?.rf ?? 0) - (r?.ra ?? 0),
      inPool: (pool as readonly string[]).includes(k),
    });
  }
  rows.sort(
    (a, b) =>
      Number(b.inPool) - Number(a.inPool) ||
      b.winRate - a.winRate ||
      b.games - a.games,
  );
  return rows;
}

// converte mapStats no formato {w,l} por mapa que o VetoScreen já consome.
export function mapRecordFromStats(
  mapStats: Record<string, MapStatRec> | undefined,
): Record<string, { w: number; l: number }> {
  const ms = mapStats ?? {};
  const out: Record<string, { w: number; l: number }> = {};
  for (const k of Object.keys(ms)) out[k] = { w: ms[k].w, l: ms[k].l };
  return out;
}
