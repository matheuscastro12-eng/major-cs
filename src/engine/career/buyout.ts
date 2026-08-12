// CLÁUSULA DE RESCISÃO (#37 do gap Brasval). Puro, sem React.
//
// A IA não tem contratos persistidos — o contrato de um jogador de IA é
// DERIVADO e consistente no tempo: splitsLeft(id, split) decresce 1 a cada
// split e re-assina num ciclo de 6 (como contratos reais de 1-2 anos).
// Contrato longo (2+ splits restantes) = CLÁUSULA ATIVA: arrancar o jogador
// antes do fim custa multa — um piso ABSOLUTO no decideOffer que nem o
// desconto de infeliz fura (o infeliz com cláusula quer sair, mas o clube
// segura o papel).

import { hashStr } from '../../state/hash';

const CONTRACT_CYCLE = 6;            // splits entre renovações do "contrato" derivado
export const BUYOUT_MIN_SPLITS = 2;  // cláusula só com 2+ splits restantes

// splits restantes do contrato derivado (0..5). Consistente: avança o split,
// cai 1; no fim do ciclo, "renova" e volta a 5.
export function aiContractSplitsLeft(playerId: string, split: number): number {
  const anchor = hashStr(`contract:${playerId}`) % CONTRACT_CYCLE;
  return ((anchor - split) % CONTRACT_CYCLE + CONTRACT_CYCLE) % CONTRACT_CYCLE;
}

// multa da cláusula: piso absoluto da negociação. Escalona com o contrato —
// 2 splits restantes = 1.4×, 5 = 1.8× o valor de mercado. 0 = sem cláusula.
export function buyoutFloorOf(marketValue: number, playerId: string, split: number): number {
  const left = aiContractSplitsLeft(playerId, split);
  if (left < BUYOUT_MIN_SPLITS) return 0;
  return Math.round(marketValue * (1 + 0.2 * Math.min(left, 4)));
}
