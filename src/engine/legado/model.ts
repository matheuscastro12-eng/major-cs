// LEGADO E DINASTIA — contrato do bloco opcional `save.legado` (Carreira).
//
// Princípio: quase tudo do legado é DERIVADO do que o save já guarda (history,
// seasonStats, careerStats, stints, coachStints, mundo.results). Só entra no
// save o que não dá pra reconstruir depois:
//   - os prêmios da cena de cada ano (calculados no fechamento do ano com o
//     mundo DAQUELE momento: OVR, times e idades mudam depois);
//   - as camisas aposentadas (decisão sua);
//   - o último ano cuja cerimônia você já viu.
// Bloco opcional e podado: não sobe SAVE_VERSION (save sem o bloco = legado vazio).
// Puro, sem React.

import type { Role } from '../../types';

/** Uma linha do Top 20 do ano (compacta: só o que a cerimônia e os cards mostram). */
export interface SceneTopEntry {
  id: string;          // id estável do jogador (sem user__)
  nick: string;
  country: string;
  role: Role;
  age?: number;
  team: string;        // tag do time no fim do ano
  teamId: string;      // 'user' = o seu clube
  ovr: number;
  rating: number;      // rating HLTV 2.0 do ano (0 = sem amostra)
  maps: number;        // mapas com estatística no ano
  titles: number;      // títulos do time no ano (campeão de evento)
  score: number;       // nota do ranking (1 casa)
}

/** MVP de um evento grande do ano (campeão do evento → melhor jogador do campeão). */
export interface SceneEventMvp {
  eventId: string;
  event: string;       // nome do evento
  tier: 1 | 2 | 3;
  major: boolean;
  split: number;
  playerId: string;
  nick: string;
  team: string;
  teamId: string;
}

export interface SceneCoachAward {
  nick: string;
  team: string;
  teamId: string;
  titles: number;
  points: number;      // pontos de resultado do ano (régua do prêmio)
}

/** Prêmios da cena de um ano de Carreira (snapshot do fechamento do ano). */
export interface SceneYearAwards {
  year: number;        // 1, 2, 3… (ano = 4 splits; split 1–4 = ano 1)
  startSplit: number;
  endSplit: number;
  top20: SceneTopEntry[];
  mvps: SceneEventMvp[];        // até MAX_EVENT_MVPS, Major primeiro
  revelation: string | null;    // id (deve estar no pool do ano; ver `revelationEntry`)
  revelationEntry?: SceneTopEntry | null; // a revelação pode estar fora do Top 20
  coach: SceneCoachAward | null;
  ideal: string[];              // 5 ids do Top 20 (AWP, IGL e os 3 melhores)
}

/** Camisa aposentada: a lenda que nunca mais terá o número vestido no clube. */
export interface RetiredShirt {
  playerId: string;
  nick: string;
  split: number;       // split em que a camisa subiu
  maps: number;
  titles: number;
}

export interface LegadoState {
  v: 1;
  years: SceneYearAwards[];     // mais antigo primeiro, podado em MAX_YEARS
  shirts: RetiredShirt[];       // podado em MAX_SHIRTS
  seenYear?: number;            // último ano cuja cerimônia você já assistiu
}

export const MAX_YEARS = 8;
export const MAX_SHIRTS = 12;
export const MAX_EVENT_MVPS = 6;
export const SPLITS_PER_YEAR = 4;

/** Ano de Carreira de um split (1-based: splits 1–4 = ano 1). */
export const yearOfSplit = (split: number): number => Math.max(1, Math.ceil(Math.max(1, split) / SPLITS_PER_YEAR));
/** Último ano já FECHADO quando o save está neste split (0 = nenhum). */
export const lastClosedYear = (split: number): number => Math.floor((Math.max(1, split) - 1) / SPLITS_PER_YEAR);
export const yearRange = (year: number): [number, number] => [(year - 1) * SPLITS_PER_YEAR + 1, year * SPLITS_PER_YEAR];

export function emptyLegado(): LegadoState {
  return { v: 1, years: [], shirts: [] };
}

/** Lê o bloco com tolerância (ausente/corrompido = vazio). Nunca lança. */
export function legadoOf(raw: unknown): LegadoState {
  if (!raw || typeof raw !== 'object') return emptyLegado();
  const r = raw as Partial<LegadoState>;
  if (r.v !== 1) return emptyLegado();
  return {
    v: 1,
    years: Array.isArray(r.years) ? r.years.filter((y) => y && typeof y.year === 'number' && Array.isArray(y.top20)) : [],
    shirts: Array.isArray(r.shirts) ? r.shirts.filter((s) => s && typeof s.playerId === 'string') : [],
    seenYear: typeof r.seenYear === 'number' ? r.seenYear : undefined,
  };
}

/** Poda: guarda os MAX_YEARS anos mais recentes e as MAX_SHIRTS camisas. */
export function pruneLegado(s: LegadoState): LegadoState {
  const years = [...s.years].sort((a, b) => a.year - b.year);
  const dedup = new Map<number, SceneYearAwards>();
  for (const y of years) dedup.set(y.year, y);
  return {
    ...s,
    years: [...dedup.values()].slice(-MAX_YEARS),
    shirts: s.shirts.slice(-MAX_SHIRTS),
  };
}

export function withYear(s: LegadoState, y: SceneYearAwards): LegadoState {
  return pruneLegado({ ...s, years: [...s.years.filter((x) => x.year !== y.year), y] });
}

export function withShirt(s: LegadoState, shirt: RetiredShirt): LegadoState {
  if (s.shirts.some((x) => x.playerId === shirt.playerId)) return s;
  return pruneLegado({ ...s, shirts: [...s.shirts, shirt] });
}

/** Ano fechado ainda não calculado (o próximo a calcular), ou null. */
export function pendingAwardYear(s: LegadoState, split: number): number | null {
  const closed = lastClosedYear(split);
  if (closed < 1) return null;
  return s.years.some((y) => y.year === closed) ? null : closed;
}

/** Cerimônia nova pra assistir (ano calculado e ainda não visto). */
export function unseenCeremony(s: LegadoState): SceneYearAwards | null {
  const last = s.years[s.years.length - 1];
  if (!last) return null;
  return (s.seenYear ?? 0) >= last.year ? null : last;
}
