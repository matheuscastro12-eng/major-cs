// FELICIDADE AGREGADA (#16) + VÍNCULO COM O TREINADOR (#31). Puro, sem React.
//
// A moral era um número opaco movido por eventos pontuais — impossível saber POR
// QUE o jogador está infeliz. Agora a satisfação é COMPOSTA de fatores
// observáveis e legíveis, cada um com peso explícito.
//
// [fase 3 · vestiário] UM MODELO SÓ. Os 5 fatores de sempre continuam
// (desempenho, resultados, contrato, vínculo, química) e o vestiário soma os
// que faltavam, estilo FM:
//
//   tempo de jogo × status   — o que ele joga contra o que o status promete
//   papel tático             — joga na função dele ou fora dela (fase 2)
//   salário × mercado        — o contrato (frente de contratos) contra o valor dele
//   promessas                — cumpridas, abertas e quebradas
//   comissão técnica         — staffEffects().moraleRecovery / gestão de pessoas
//   grupo social             — tem com quem falar no elenco? está em atrito?
//   ambição × clube          — o tamanho do clube contra o que ele quer
//
// Cada fator novo é OPCIONAL: sem o dado, o fator não entra e o peso se
// redistribui entre os presentes (a conta com só os 5 antigos dá exatamente o
// número de antes). O valor "como esperado" de cada fator novo é 60 (satisfeito),
// igual ao patamar típico dos antigos: o elenco de 5 sem nada configurado fica
// com a mesma satisfação (neutralidade medida em scripts/measure-vestiario.mts).
//
// A satisfação persiste SUAVIZADA (0.5 por split — sem teleporte de humor) e
// puxa a moral devagar (drift ±3): jogador mal pago em time perdedor corrói,
// consistentemente, até você agir.

export interface HappinessFactors {
  performance: number;   // 0-100
  results: number;
  contract: number;
  bond: number;
  chemistry: number;
  // [fase 3 · vestiário] fatores novos (presentes quando o dado existe)
  playTime?: number;
  role?: number;
  wage?: number;
  promises?: number;
  staff?: number;
  social?: number;
  ambition?: number;
}

export type HappinessFactorKey = keyof HappinessFactors;

export interface HappinessBreakdown {
  overall: number;       // 0-100 (média ponderada)
  factors: HappinessFactors;
}

// pesos do modelo unificado (somam 1). Os 5 antigos mantêm a proporção de antes
// (25:25:15:20:15), então com só eles presentes o overall é o mesmo de sempre.
export const HAPPINESS_WEIGHTS: Record<HappinessFactorKey, number> = {
  performance: 0.1375, results: 0.1375, contract: 0.0825, bond: 0.11, chemistry: 0.0825,
  playTime: 0.14, role: 0.05, wage: 0.06, promises: 0.05, staff: 0.05, social: 0.06, ambition: 0.04,
};

export const HAPPINESS_FACTOR_LABEL: Record<HappinessFactorKey, string> = {
  performance: 'Desempenho', results: 'Resultados', contract: 'Contrato', bond: 'Vínculo', chemistry: 'Química',
  playTime: 'Tempo de jogo', role: 'Papel tático', wage: 'Salário', promises: 'Promessas', staff: 'Comissão',
  social: 'Grupo social', ambition: 'Ambição',
};

export const HAPPINESS_FACTOR_ORDER: HappinessFactorKey[] = [
  'playTime', 'performance', 'results', 'role', 'contract', 'wage', 'promises', 'bond', 'staff', 'chemistry', 'social', 'ambition',
];

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface HappinessInputs {
  ratings?: number[];              // janela recente do jogador (recentRatings)
  results01?: number;              // campanha do time no split, 0..1 (winrate/colocação)
  contractSplitsLeft: number | null; // splits restantes de contrato (null = sem registro)
  bond: number;                    // coachBond 0-100
  chemistry: number;               // entrosamento 0-100
  // [fase 3 · vestiário] fatores novos já em 0-100 (clube/vestiario.ts calcula)
  playTime?: number;
  role?: number;
  wage?: number;
  promises?: number;
  staff?: number;
  social?: number;
  ambition?: number;
}

const EXTRA_KEYS = ['playTime', 'role', 'wage', 'promises', 'staff', 'social', 'ambition'] as const;

export function computeHappiness(i: HappinessInputs): HappinessBreakdown {
  // performance: rating 0.85→30, 1.0→55, 1.15→75, 1.3+→95 (linear por trechos)
  const avg = i.ratings && i.ratings.length >= 2
    ? i.ratings.reduce((a, b) => a + b, 0) / i.ratings.length
    : null;
  const performance = avg == null ? 60 : clamp(Math.round(55 + (avg - 1.0) * 130));
  const results = clamp(Math.round((i.results01 ?? 0.5) * 100));
  // contrato: 2+ splits = seguro; 1 = atento; expirando = ansioso
  const contract = i.contractSplitsLeft == null ? 70
    : i.contractSplitsLeft >= 2 ? 90
    : i.contractSplitsLeft === 1 ? 60
    : 40;
  const factors: HappinessFactors = {
    performance,
    results,
    contract,
    bond: clamp(Math.round(i.bond)),
    chemistry: clamp(Math.round(i.chemistry)),
  };
  for (const k of EXTRA_KEYS) {
    const v = i[k];
    if (typeof v === 'number' && Number.isFinite(v)) factors[k] = clamp(Math.round(v));
  }
  // média ponderada SÓ dos fatores presentes (o peso dos ausentes se redistribui)
  let sum = 0, wsum = 0;
  for (const k of Object.keys(factors) as HappinessFactorKey[]) {
    const v = factors[k];
    if (v == null) continue;
    sum += v * HAPPINESS_WEIGHTS[k];
    wsum += HAPPINESS_WEIGHTS[k];
  }
  const overall = clamp(Math.round(wsum > 0 ? sum / wsum : 60));
  return { overall, factors };
}

// satisfação suavizada: meio caminho por split (humor não teleporta).
export function tickSatisfaction(prev: number | undefined, target: number): number {
  const base = prev ?? target;
  return clamp(Math.round(base + (target - base) * 0.5));
}

// a satisfação puxa a moral DEVAGAR (±3/split no máximo) — corrosão/da recuperação
// estrutural, distinta dos eventos pontuais que continuam batendo na moral.
export function satisfactionMoraleDrift(morale: number, satisfaction: number): number {
  const gap = satisfaction - morale;
  return Math.max(-3, Math.min(3, Math.round(gap * 0.15)));
}

// #31 — psicólogo do clube também trabalha a RELAÇÃO: puxa vínculos extremos
// levemente rumo ao neutro-positivo (55) conforme o nível da instalação.
export function stabilizeBond(bond: number, psychologistLevel: number): number {
  if (psychologistLevel <= 0) return clamp(Math.round(bond));
  const pull = Math.min(2, psychologistLevel);
  return clamp(Math.round(bond + Math.sign(55 - bond) * Math.min(pull, Math.abs(55 - bond) * 0.1)));
}

export const BOND_DEFAULT = 50;
