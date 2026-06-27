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
