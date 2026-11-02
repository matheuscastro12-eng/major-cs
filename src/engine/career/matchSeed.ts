// SEED DA PARTIDA DA CARREIRA — derivado do save (O1-46 / ENGI-11).
//
// Antes cada simulação da Carreira usava randomSeed() e o resultado só era
// gravado no onDone da animação: F5 no meio descartava o resultado e o próximo
// clique sorteava outro placar (derrota desfeita no refresh). Derivando o seed
// de dados estáveis do save (org + split + etapa + chave do jogo), re-simular o
// MESMO jogo a partir do MESMO save dá exatamente o mesmo placar. Puro.

import { hashStr } from '../../state/hash';

export interface MatchSeedSave {
  org: { name: string; tag: string; colors: [string, string] } | null;
  split: number;
  eventInSplit?: number;
}

// `key` identifica o jogo dentro da etapa (liga + rodada + ids, playoff, Major…).
export function careerMatchSeed(s: MatchSeedSave, key: string): number {
  const org = s.org ? `${s.org.name}|${s.org.tag}|${s.org.colors.join(',')}` : 'sem-org';
  return (hashStr(`career:${org}`) ^ hashStr(`${s.split}:${s.eventInSplit ?? 1}:${key}`)) >>> 0;
}
