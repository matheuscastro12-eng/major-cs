// Scrim semanal — T3.8 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// O manager pode marcar SCRIMS (treinos contra outros times) entre etapas.
// Cada scrim:
//   - Custa um valor fixo (custo de logística + sala)
//   - Sobe a química entre todos os pares dos 5 starters
//   - Reduz fadiga acumulada
//   - Tem cooldown (max 2 por split — pra não virar farm trivial)
//
// Função pura. CareerScreen aplica o patch retornado no save.

import type { Rng } from './rng';
import { pairKey } from './chemistry';
import type { MapId, TTeam } from '../types';
import { MAP_LABELS, MAP_POOL } from '../types';
import { computeDisplay, simulateSeries } from './match';
import { hashStr } from '../state/hash';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export interface ScrimState {
  /** Split atual */
  split: number;
  /** Caixa disponível pra checar se pode pagar */
  budget: number;
  /** Quantas scrims já rolaram NESTE split */
  scrimsThisSplit: number;
  /** IDs dos 5 starters (pra atualizar chemistry) */
  starterIds: string[];
  /** Chemistry atual (read-only — engine devolve novo) */
  pairChem?: Record<string, number>;
  /** Fadiga por player (read-only) */
  fatigue?: Record<string, number>;
}

export interface ScrimResult {
  /** Texto curto pra exibir no UI */
  outcome: string;
  /** Nome do adversário fictício pra dar contexto */
  opponentName: string;
  /** Patch parcial que o consumer aplica no save */
  patch: ScrimPatch;
}

export interface ScrimPatch {
  budgetDelta: number;
  scrimsThisSplitNext: number;
  pairChem: Record<string, number>;
  fatigue: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes

const SCRIM_COST = 5_000;
const MAX_SCRIMS_PER_SPLIT = 2;
const CHEM_GAIN_PER_PAIR = 1.5;     // sobe 1.5 em todos os 10 pares
const FATIGUE_REDUCTION = 8;         // -8 fatigue por player (cap em 0)
const MAX_PAIR_VALUE = 100;

const OPPONENT_NAMES = [
  'Sharks Academy', 'Black Dragons B', 'Phoenix Junior', 'Aurora Sub',
  'Inception ALT', 'Loud Foundation', 'M80 Academy', 'pain Stage',
  'KaBuM! Lite', 'RED Canids B', 'Hype Junior', 'Reload BSP',
];

// ─────────────────────────────────────────────────────────────────────────────
// Validação

export function canScrimNow(state: ScrimState): { ok: boolean; reason?: string } {
  if (state.scrimsThisSplit >= MAX_SCRIMS_PER_SPLIT) {
    return { ok: false, reason: `Limite de ${MAX_SCRIMS_PER_SPLIT} scrims por split atingido` };
  }
  if (state.budget < SCRIM_COST) {
    return { ok: false, reason: `Caixa insuficiente (precisa $${SCRIM_COST.toLocaleString('pt-BR')})` };
  }
  if (state.starterIds.length < 5) {
    return { ok: false, reason: 'Elenco incompleto (precisa 5 titulares)' };
  }
  return { ok: true };
}

// Read-only: pra UI mostrar "X de 2 scrims usados"
export function scrimQuotaText(state: ScrimState): string {
  return `${state.scrimsThisSplit} / ${MAX_SCRIMS_PER_SPLIT} usadas`;
}

export const SCRIM_INFO = {
  cost: SCRIM_COST,
  maxPerSplit: MAX_SCRIMS_PER_SPLIT,
  chemGain: CHEM_GAIN_PER_PAIR,
  fatigueReduction: FATIGUE_REDUCTION,
};

// ─────────────────────────────────────────────────────────────────────────────
// Execução

/**
 * Roda 1 scrim. Calcula deltas + sorteia adversário. Não muta o `state`.
 * Lança Error se `canScrimNow` falhar — chamador deve validar antes.
 */
export function runScrim(state: ScrimState, rng: Rng): ScrimResult {
  const check = canScrimNow(state);
  if (!check.ok) throw new Error(`Scrim inválida: ${check.reason}`);

  // sorteia adversário
  const opponentName = OPPONENT_NAMES[Math.floor(rng() * OPPONENT_NAMES.length)];

  // chemistry: +CHEM_GAIN em todos os 10 pares dos starters
  const newChem = { ...(state.pairChem ?? {}) };
  for (let i = 0; i < state.starterIds.length; i++) {
    for (let j = i + 1; j < state.starterIds.length; j++) {
      const k = pairKey(state.starterIds[i], state.starterIds[j]);
      const cur = newChem[k] ?? 30;
      newChem[k] = Math.min(MAX_PAIR_VALUE, cur + CHEM_GAIN_PER_PAIR);
    }
  }

  // fadiga: -FATIGUE_REDUCTION em todos os starters (cap 0)
  const newFatigue = { ...(state.fatigue ?? {}) };
  for (const id of state.starterIds) {
    const cur = newFatigue[id] ?? 0;
    newFatigue[id] = Math.max(0, cur - FATIGUE_REDUCTION);
  }

  const outcomeFlavors = [
    'Treino produtivo: pegada melhor nos defaults.',
    'Boa scrim. Coach saiu animado com a comunicação.',
    'Sessão dura, mas com clima leve no vestiário.',
    'Treino sólido: erros tácitos corrigidos.',
    'Scrim quente, com bons retakes no segundo half.',
  ];
  const outcome = outcomeFlavors[Math.floor(rng() * outcomeFlavors.length)];

  return {
    outcome,
    opponentName,
    patch: {
      budgetDelta: -SCRIM_COST,
      scrimsThisSplitNext: state.scrimsThisSplit + 1,
      pairChem: newChem,
      fatigue: newFatigue,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// #6/#21 (gap Brasval) — scrim contra ADVERSÁRIO REAL com partida de verdade.
//
// Em vez de um nome fictício e patch fixo, o manager ESCOLHE o sparring numa
// banda de força ao redor do próprio time (sparring muito acima/abaixo não
// aceita) e o scrim roda o MESMO motor de partida das séries oficiais em MD1,
// devolvendo um relatório de treino real (placar, MVP, rating por titular).
// Vencer — especialmente sparring mais forte — rende mais química.

/** Banda de força pro sparring (±). Fora dela o time nem aparece na lista. */
export const SCRIM_STRENGTH_BAND = 7;
const SCRIM_LIST_MAX = 6;

export type ScrimAvail = 'available' | 'busy' | 'declined';

export interface ScrimOpponentOption {
  id: string;
  name: string;
  tag: string;
  colors: [string, string];
  logoUrl?: string;
  strength: number;
  /** Delta de força vs seu time (positivo = sparring mais forte). */
  diff: number;
  avail: ScrimAvail;
}

/**
 * Lista sparrings elegíveis: os mais próximos em força dentro da banda, com
 * disponibilidade DETERMINÍSTICA por split+uso (mesma semana → mesma lista;
 * jogar uma scrim reabre o sorteio). Garante ≥2 disponíveis quando há opções.
 */
export function listScrimOpponents(
  myStrength: number,
  world: Pick<TTeam, 'id' | 'name' | 'tag' | 'colors' | 'logoUrl' | 'strength'>[],
  split: number,
  scrimsUsed: number,
): ScrimOpponentOption[] {
  const band = world
    .filter((t) => Math.abs(t.strength - myStrength) <= SCRIM_STRENGTH_BAND)
    .sort((a, b) => Math.abs(a.strength - myStrength) - Math.abs(b.strength - myStrength))
    .slice(0, SCRIM_LIST_MAX);
  const opts = band.map((t): ScrimOpponentOption => {
    const roll = hashStr(`scrim:${t.id}:${split}:${scrimsUsed}`) % 10;
    const avail: ScrimAvail = roll <= 6 ? 'available' : roll <= 8 ? 'busy' : 'declined';
    return {
      id: t.id, name: t.name, tag: t.tag, colors: t.colors, logoUrl: t.logoUrl,
      strength: Math.round(t.strength),
      diff: Math.round(t.strength - myStrength),
      avail,
    };
  });
  // fail-safe: sorteio azarado não pode travar o botão — força os 2 mais
  // próximos pra "available" se a lista inteira caiu ocupada/recusou.
  if (opts.length > 0 && opts.filter((o) => o.avail === 'available').length < 2) {
    for (const o of opts.slice(0, 2)) o.avail = 'available';
  }
  return opts;
}

export interface ScrimLine { nick: string; k: number; d: number; rating: number; }

export interface ScrimMatchReport {
  won: boolean;
  myScore: number;
  oppScore: number;
  mapLabel: string;
  oppName: string;
  oppTag: string;
  mvp: string | null;      // nick do seu melhor rating
  lines: ScrimLine[];      // titulares, rating↓
  outcome: string;         // leitura do coach pro resultado
  chemGain: number;        // por par (pra UI mostrar o que rendeu)
}

/**
 * Roda a scrim CONTRA o sparring escolhido usando o motor real (MD1). Lança
 * Error se `canScrimNow` falhar — chamador valida antes. Não muta `state`.
 */
export function runScrimVs(
  state: ScrimState,
  me: TTeam,
  opp: TTeam,
  rng: Rng,
): { report: ScrimMatchReport; patch: ScrimPatch } {
  const check = canScrimNow(state);
  if (!check.ok) throw new Error(`Scrim inválida: ${check.reason}`);

  const map: MapId = MAP_POOL[Math.floor(rng() * MAP_POOL.length)];
  const series = simulateSeries(rng, me, opp, [{ map, pickedBy: -1 }], 1);
  const won = series.winner === 0;
  const mapRes = series.maps[0];

  // linhas dos SEUS titulares (rating HLTV do mapa, mesmo cálculo das séries)
  const lines: ScrimLine[] = me.players.map((p) => {
    const st = mapRes.stats[p.id]?.both;
    const disp = st ? computeDisplay(st) : null;
    return { nick: p.nick, k: st?.kills ?? 0, d: st?.deaths ?? 0, rating: disp ? Math.round(disp.rating * 100) / 100 : 0 };
  }).sort((a, b) => b.rating - a.rating);
  const mvp = lines[0]?.nick ?? null;

  // química escala com o resultado: vencer rende mais; bater sparring MAIS
  // FORTE rende o máximo (a scrim difícil é a que mais ensina).
  const harder = opp.strength >= me.strength + 2;
  const chemGain = Math.round((CHEM_GAIN_PER_PAIR * (won ? (harder ? 1.6 : 1.3) : 0.8)) * 10) / 10;
  const newChem = { ...(state.pairChem ?? {}) };
  for (let i = 0; i < state.starterIds.length; i++) {
    for (let j = i + 1; j < state.starterIds.length; j++) {
      const k = pairKey(state.starterIds[i], state.starterIds[j]);
      newChem[k] = Math.min(MAX_PAIR_VALUE, (newChem[k] ?? 30) + chemGain);
    }
  }
  const newFatigue = { ...(state.fatigue ?? {}) };
  for (const id of state.starterIds) {
    newFatigue[id] = Math.max(0, (newFatigue[id] ?? 0) - FATIGUE_REDUCTION);
  }

  const outcome = won
    ? (harder
        ? 'Vitória contra sparring mais forte — o vestiário saiu voando. Confiança lá em cima.'
        : 'Treino sólido: plano executado, defaults redondos.')
    : (harder
        ? 'Derrota esperada contra time mais forte — mas os erros ficaram claros no review.'
        : 'Scrim ruim. O coach cobrou disciplina — bom levar isso pro próximo oficial.');

  return {
    report: {
      won,
      myScore: mapRes.score[0],
      oppScore: mapRes.score[1],
      mapLabel: MAP_LABELS[map] ?? map,
      oppName: opp.name,
      oppTag: opp.tag,
      mvp,
      lines,
      outcome,
      chemGain,
    },
    patch: {
      budgetDelta: -SCRIM_COST,
      scrimsThisSplitNext: state.scrimsThisSplit + 1,
      pairChem: newChem,
      fatigue: newFatigue,
    },
  };
}
