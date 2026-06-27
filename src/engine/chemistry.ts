// Chemistry — T3.4 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Modelo enxuto inspirado FM/Brasval: cada PAR de jogadores tem uma química
// 0-100. Ao jogar juntos, sobe; troca de elenco quebra (recém-chegado tem
// química baixa com os outros). Média dos 5 starters vira um MULTIPLIER na
// força do time (0.95 a 1.05) — diferença de até 10% no resultado de série.
//
// Storage: `save.pairChem: Record<string, number>` onde a key é o par ordenado
// (canonical) `sortedIdA + '|' + sortedIdB`. Default ausência = 30 (recém-
// conhecidos). Subir química leva tempo (~+2 por partida juntos).

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export interface ChemistryState {
  pairChem?: Record<string, number>;
}

const DEFAULT_PAIR = 30;
const MIN_PAIR = 0;
const MAX_PAIR = 100;

const GAIN_PER_MATCH = 2.0;       // sobe 2 por partida juntos (numa série de 3 mapas = +6)
const WIN_BONUS = 1.0;             // vitória dá +1 extra
const DECAY_PER_SPLIT = 1.0;       // pares que não jogam juntos decaem 1 por split

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

/** Cria a key canonical (alfabética) pra um par. Garante simetria. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Lê chemistry de um par. Default 30 quando ausente. */
export function getPairChem(state: ChemistryState, a: string, b: string): number {
  const k = pairKey(a, b);
  return state.pairChem?.[k] ?? DEFAULT_PAIR;
}

/** Média de chemistry dos pares dentre os starters (5 IDs → 10 pares). */
export function averageStarterChemistry(state: ChemistryState, starterIds: string[]): number {
  if (starterIds.length < 2) return DEFAULT_PAIR;
  let total = 0;
  let count = 0;
  for (let i = 0; i < starterIds.length; i++) {
    for (let j = i + 1; j < starterIds.length; j++) {
      total += getPairChem(state, starterIds[i], starterIds[j]);
      count += 1;
    }
  }
  return count > 0 ? total / count : DEFAULT_PAIR;
}

/** Modifier multiplicativo na força do time. Avg 50 = 1.0 (neutro);
 *  avg 100 = 1.05; avg 0 = 0.95. Curva linear simples. */
export function chemistryMatchModifier(avgChem: number): number {
  return 0.95 + (avgChem / 100) * 0.10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick — atualiza química após série jogada

/**
 * Tick após série jogada. Sobe a química de TODOS os pares entre os starters
 * que jogaram juntos. Vitória dá pequeno bônus.
 *
 * T3.2: aceita `personalityBonus(playerId)` opcional — multiplicador de
 * personality (leader = 1.4, mercenary = 0.8, etc.). Aplicado como MÉDIA
 * dos 2 players do par. Sem o parâmetro, comportamento legacy (1.0).
 *
 * Devolve o NOVO pairChem record (imutável; muta a cópia).
 */
export function tickPairChemAfterMatch(
  state: ChemistryState,
  starterIds: string[],
  won: boolean,
  personalityBonus?: (playerId: string) => number,
): Record<string, number> {
  const out: Record<string, number> = { ...(state.pairChem ?? {}) };
  const baseGain = GAIN_PER_MATCH + (won ? WIN_BONUS : 0);
  for (let i = 0; i < starterIds.length; i++) {
    for (let j = i + 1; j < starterIds.length; j++) {
      const k = pairKey(starterIds[i], starterIds[j]);
      const cur = out[k] ?? DEFAULT_PAIR;
      // Bônus por par = média dos modifiers de personality dos 2 players.
      const bonus = personalityBonus
        ? (personalityBonus(starterIds[i]) + personalityBonus(starterIds[j])) / 2
        : 1;
      out[k] = Math.max(MIN_PAIR, Math.min(MAX_PAIR, cur + baseGain * bonus));
    }
  }
  return out;
}

/**
 * Decay leve dos pares no fim do split. Pares que NÃO estão no squad atual
 * decaem mais rápido (jogador saiu) — esses ids viram irrelevantes.
 *
 * Por simplicidade, esta versão aplica decay UNIFORME a todos os pares
 * existentes — pares "ausentes" (jogadores que saíram) decaem mas eventualmente
 * podem ser limpos quando atingem 0 (não fazemos limpeza ativa agora).
 */
export function decayPairChemOnSplitChange(state: ChemistryState): Record<string, number> {
  const out: Record<string, number> = { ...(state.pairChem ?? {}) };
  for (const k of Object.keys(out)) {
    const v = out[k];
    out[k] = Math.max(MIN_PAIR, v - DECAY_PER_SPLIT);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers

/** Devolve cor pra display da química num grid heatmap. */
export function chemColor(value: number): string {
  if (value >= 80) return '#5ed88a';   // verde brilhante
  if (value >= 60) return '#a3d860';
  if (value >= 40) return '#d8c060';   // amarelo
  if (value >= 20) return '#d89060';   // laranja
  return '#e58a8a';                     // vermelho
}

/** Label curto pra tier de química. */
export function chemLabel(value: number): string {
  if (value >= 80) return 'Excelente';
  if (value >= 60) return 'Boa';
  if (value >= 40) return 'Mediana';
  if (value >= 20) return 'Fraca';
  return 'Estranhos';
}
