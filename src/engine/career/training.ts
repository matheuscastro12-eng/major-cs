// FOCO DE TREINO POR ATRIBUTO (#22 do gap Brasval). Puro, sem React.
//
// O desenvolvimento era uma caixa-preta com 1 alavanca binária (trainingFocus
// on/off). Agora cada jogador pode ter um FOCO: qual dos 5 atributos-núcleo ele
// trabalha. A evolução geral (evo, flat nos 5) continua a mesma — o foco
// acumula um VIÉS extra no atributo escolhido (+1 por split de desenvolvimento,
// até +4), especializando de verdade: o entry que treina mira abre distância na
// mira antes do resto.
//
// suggestFocus: recomenda a MAIOR LACUNA relevante pra função — o dado de
// scouting que o Brasval mostra como selo "recomendado".

import type { Player, Role } from '../../types';

export type CoreStat = 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl';

export const CORE_STATS: CoreStat[] = ['aim', 'clutch', 'consistency', 'awp', 'igl'];

export const TRAINING_FOCUS_LABEL: Record<CoreStat, string> = {
  aim: 'Mira', clutch: 'Clutch', consistency: 'Consistência', awp: 'AWP', igl: 'Leitura de jogo',
};

// teto do viés por atributo e total (o foco especializa, não quebra o balanço)
export const FOCUS_BIAS_CAP = 4;

// relevância de cada atributo por função (peso na sugestão) — a lacuna só
// importa se o atributo importa pra role.
const ROLE_RELEVANCE: Record<Role, Partial<Record<CoreStat, number>>> = {
  AWP: { awp: 3, aim: 2, clutch: 1.5, consistency: 1 },
  IGL: { igl: 3, consistency: 1.5, clutch: 1.2, aim: 1 },
  Entry: { aim: 3, clutch: 1.5, consistency: 1.5 },
  Rifler: { aim: 2.5, consistency: 2, clutch: 1.2 },
  Support: { consistency: 2.5, igl: 2, aim: 1.2 },
  Lurker: { clutch: 2.5, consistency: 1.8, aim: 1.5 },
};

// Sugere o foco: maior (lacuna até o teto prático) × (relevância pra role).
// `bias` = viés já acumulado (lacuna considera o que o foco já rendeu).
export function suggestFocus(p: Player, bias?: Partial<Record<CoreStat, number>>): CoreStat {
  const rel = ROLE_RELEVANCE[p.role] ?? {};
  let best: CoreStat = 'aim';
  let bestScore = -Infinity;
  for (const k of CORE_STATS) {
    const cur = p[k] + (bias?.[k] ?? 0);
    const gap = Math.max(0, 92 - cur);              // teto prático de atributo
    const score = gap * (rel[k] ?? 0.5);
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}

// Aplica um split de desenvolvimento FOCADO: +1 no atributo escolhido, com cap
// por atributo e cap total. Imutável.
export function applyFocusBias(
  bias: Partial<Record<CoreStat, number>> | undefined,
  focus: CoreStat,
): Partial<Record<CoreStat, number>> {
  const cur = { ...(bias ?? {}) };
  const total = CORE_STATS.reduce((s, k) => s + (cur[k] ?? 0), 0);
  if ((cur[focus] ?? 0) >= FOCUS_BIAS_CAP || total >= FOCUS_BIAS_CAP + 2) return cur;
  cur[focus] = (cur[focus] ?? 0) + 1;
  return cur;
}

// Viés total (pra exibir "+N especializado" na UI).
export function focusBiasTotal(bias: Partial<Record<CoreStat, number>> | undefined): number {
  return CORE_STATS.reduce((s, k) => s + (bias?.[k] ?? 0), 0);
}
