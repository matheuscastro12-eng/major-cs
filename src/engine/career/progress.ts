export function careerEventKey(split: number, eventInSplit: number | undefined): string {
  return `${Math.max(1, Math.floor(split))}:${Math.max(1, Math.floor(eventInSplit ?? 1))}`;
}

// [fase 4 · circuito] O VRS rolante do jogador (decaimento 0,6 por evento) e o
// rolante SORTEADO da IA (aiRollingVrs) saíram: agora há UM ranking só, calculado
// dos resultados do mundo (engine/mundo/vrs.ts — premiação real, rede de
// adversários, LAN; decaimento pela idade), igual pra IA e pro usuário.
