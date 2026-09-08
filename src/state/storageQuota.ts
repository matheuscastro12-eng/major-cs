// RESGATE DE COTA do localStorage.
//
// Motivação (dado real, 7 dias): 210 jogadores DISTINTOS estouraram a cota
// gravando `rtm-career-v1` — e o save simplesmente NÃO era escrito. A pessoa
// segue jogando, o jogo parece normal, e o progresso morre no refresh. É o
// erro mais frequente do jogo, com folga.
//
// A causa é acúmulo, não um save gigante isolado: cada slot guarda um backup
// `.bak` (dobra o custo do slot) e pode ter um `.corrupt` (diagnóstico), e são
// 5 slots de carreira + RtP + Ultimate + online no mesmo domínio.
//
// Regra desta camada: **o save principal é a ÚLTIMA coisa que pode falhar.**
// Se a cota recusar a escrita, liberamos o que é DESCARTÁVEL, em ordem de
// arrependimento crescente, e tentamos de novo:
//   1. `.corrupt` — puro diagnóstico, nunca é lido pra jogar;
//   2. `.bak` de OUTRAS chaves — backup de um passo de outros saves;
//   3. `.bak` da própria chave — o backup do save que estamos gravando.
// Perder um backup é ruim. Perder a partida do jogador é pior.

const isQuotaError = (e: unknown): boolean => {
  if (!(e instanceof Error)) return false;
  // Chrome/Safari/Firefox divergem no name e no code; a mensagem é o menor
  // denominador comum ('exceeded the quota' / 'quota has been exceeded').
  const name = e.name;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(e.message)
  );
};

/** Chaves descartáveis do domínio, em ordem de arrependimento crescente. */
function disposableKeys(exceptKey: string): string[] {
  const corrupt: string[] = [];
  const otherBak: string[] = [];
  const ownBak: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.endsWith('.corrupt')) corrupt.push(k);
      else if (k.endsWith('.bak')) (k === `${exceptKey}.bak` ? ownBak : otherBak).push(k);
    }
  } catch {
    return [];
  }
  return [...corrupt, ...otherBak, ...ownBak];
}

export interface QuotaWriteResult {
  ok: boolean;
  /** true quando só passou depois de liberar espaço (o caller pode avisar na UI) */
  rescued: boolean;
  freed: number;
  error?: unknown;
}

/**
 * Grava no localStorage com resgate de cota. Nunca lança.
 * Só mexe em chaves `.bak`/`.corrupt` — nenhum save principal é apagado aqui.
 */
export function writeWithQuotaRescue(key: string, value: string): QuotaWriteResult {
  try {
    localStorage.setItem(key, value);
    return { ok: true, rescued: false, freed: 0 };
  } catch (first) {
    if (!isQuotaError(first)) return { ok: false, rescued: false, freed: 0, error: first };
    let freed = 0;
    for (const k of disposableKeys(key)) {
      try {
        localStorage.removeItem(k);
        freed++;
      } catch {
        continue;
      }
      // tenta a cada remoção: quanto menos backup a gente descarta, melhor
      try {
        localStorage.setItem(key, value);
        return { ok: true, rescued: true, freed };
      } catch (retry) {
        if (!isQuotaError(retry)) return { ok: false, rescued: true, freed, error: retry };
      }
    }
    return { ok: false, rescued: true, freed, error: first };
  }
}
