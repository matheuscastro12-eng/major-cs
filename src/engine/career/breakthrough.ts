// POTENCIAL DINÂMICO / BREAKTHROUGH (#17 do gap Brasval). Puro, sem React.
//
// O potencial scouted é uma OPINIÃO — e opinião erra. Quem joga MUITO acima do
// esperado fura o teto: o potencial dinâmico sobe (+2/+3 por breakthrough, até
// +8 na carreira) e o treino/evolução passam a respeitar o teto novo. É a
// narrativa de scouting que faltava: o achado de base que vira estrela.
//
// Gatilhos (janela de ratings recentes, mín. 4 jogos):
//   - CONSISTÊNCIA: média ≥ 1.28 → chance de +2
//   - EXPLOSÃO: algum jogo ≥ 1.75 → chance de +3
// Dampers: idade (jovem fura fácil; 26+ nunca), OVR alto (top já é top) e
// quanto já furou (cada breakthrough anterior deixa o próximo mais raro).
// Determinístico por (jogador, split) via hashStr — sem RNG de save.

import { hashStr } from '../../state/hash';

export const BREAKTHROUGH_CAP = 8;      // máximo de teto ganho na carreira
const WINDOW_MIN = 4;                    // jogos mínimos na janela

export interface BreakthroughArgs {
  playerId: string;
  split: number;
  age: number;
  ovr: number;            // OVR efetivo atual
  pot: number;            // potencial EFETIVO atual (scouted + bônus já ganho)
  ratings: number[] | undefined;   // janela recente (recentRatings)
  currentBonus: number;   // bônus dinâmico já acumulado
}

// chance-base por idade: a régua da plasticidade.
function ageChance(age: number): number {
  if (age <= 19) return 0.6;
  if (age <= 21) return 0.45;
  if (age <= 23) return 0.3;
  if (age <= 25) return 0.15;
  return 0;                 // 26+: o scout já viu tudo que tinha pra ver
}

// Devolve o bônus NOVO de teto (0 = nada aconteceu neste split).
export function tryBreakthrough(a: BreakthroughArgs): number {
  if (!a.ratings || a.ratings.length < WINDOW_MIN) return 0;
  if (a.currentBonus >= BREAKTHROUGH_CAP) return 0;
  const base = ageChance(a.age);
  if (base <= 0) return 0;

  const avg = a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length;
  const peak = Math.max(...a.ratings);
  const explosion = peak >= 1.75;
  const consistent = avg >= 1.28;
  if (!explosion && !consistent) return 0;

  let chance = base;
  // furar de novo é cada vez mais raro (0.7^n por breakthrough anterior ≈ +2 cada)
  chance *= Math.pow(0.7, Math.floor(a.currentBonus / 2));
  // quem já é elite tem menos margem de re-avaliação
  if (a.ovr >= 88) chance *= 0.5;
  // jogar acima do próprio teto é o sinal mais forte — reforça
  if (avg >= 1.4) chance *= 1.3;

  const roll = (hashStr(`bt:${a.playerId}:${a.split}`) % 1000) / 1000;
  if (roll >= chance) return 0;
  const gain = explosion ? 3 : 2;
  return Math.min(gain, BREAKTHROUGH_CAP - a.currentBonus);
}
