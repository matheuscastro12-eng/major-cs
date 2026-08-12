// FELICIDADE AGREGADA (#16) + VÍNCULO COM O TREINADOR (#31). Puro, sem React.
//
// A moral era um número opaco movido por eventos pontuais — impossível saber POR
// QUE o jogador está infeliz. Agora a satisfação é COMPOSTA de 5 fatores
// observáveis e legíveis, cada um com peso explícito:
//
//   performance (25%) — a janela de ratings recentes do PRÓPRIO jogador
//   resultados  (25%) — campanha do time no split
//   contrato    (15%) — segurança: quanto falta de vínculo contratual
//   vínculo     (20%) — coachBond: a relação com VOCÊ (#31), movida pelas
//                        conversas 1-a-1 e estabilizada pelo psicólogo
//   química     (15%) — entrosamento (playbook/pares)
//
// Desvio consciente do Brasval: lá existe banco (playingTime/benchWeeks); aqui o
// elenco é 5 titulares — o fator não existe e o peso foi redistribuído.
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
}

export interface HappinessBreakdown {
  overall: number;       // 0-100 (média ponderada)
  factors: HappinessFactors;
}

export const HAPPINESS_WEIGHTS: Record<keyof HappinessFactors, number> = {
  performance: 0.25, results: 0.25, contract: 0.15, bond: 0.2, chemistry: 0.15,
};

export const HAPPINESS_FACTOR_LABEL: Record<keyof HappinessFactors, string> = {
  performance: 'Desempenho', results: 'Resultados', contract: 'Contrato', bond: 'Vínculo', chemistry: 'Química',
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface HappinessInputs {
  ratings?: number[];              // janela recente do jogador (recentRatings)
  results01?: number;              // campanha do time no split, 0..1 (winrate/colocação)
  contractSplitsLeft: number | null; // splits restantes de contrato (null = sem registro)
  bond: number;                    // coachBond 0-100
  chemistry: number;               // entrosamento 0-100
}

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
  const overall = clamp(Math.round(
    (Object.keys(HAPPINESS_WEIGHTS) as (keyof HappinessFactors)[])
      .reduce((s, k) => s + factors[k] * HAPPINESS_WEIGHTS[k], 0),
  ));
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
