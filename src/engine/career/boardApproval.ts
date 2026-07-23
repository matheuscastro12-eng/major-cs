// Confiança da diretoria com MEMÓRIA (#8 do gap Brasval).
//
// Antes a confiança (save.board) só mudava no fechamento do split (objetivo
// cumprido/falhou) e no Major — o user não sentia a diretoria reagindo ao
// dia-a-dia, e a demissão chegava sem rastro do porquê. Agora cada evento
// granular (vitória, derrota, caixa zerado, campanha de Major) ajusta a
// confiança na hora e grava um log (ring de BOARD_LOG_CAP) com split, delta e
// motivo — a UI mostra o histórico e o texto de demissão cita os últimos
// eventos que pesaram. Puro e determinístico: nada de Date.now/Math.random.

export interface BoardLogEntry {
  split: number;
  delta: number; // delta EFETIVO (pós-clamp 0-100), não o nominal
  reason: string; // PT-BR pronto pra UI (montado no callsite com ct())
}

// tamanho do ring — o suficiente pra ler o arco recente sem inflar o save
export const BOARD_LOG_CAP = 12;

// Deltas por evento. Calibrados pra o objetivo do split seguir sendo o maior
// peso (±12/-18, como antes): um split inteiro de vitórias (~+2 cada) empata
// com um objetivo cumprido; uma sequência de derrotas dói mais rápido.
export const APPROVAL_DELTAS = {
  matchWin: 2,
  matchLoss: -3,
  objectiveMet: 12,
  objectiveMissed: -18,
  splitCashCrunch: -4, // receitas do split não cobriram a folha (caixa zerou)
  majorChampion: 18,
  majorRun: 12,
} as const;

/**
 * Aplica um delta na confiança e registra no log. Clamp em [0, 100]; delta
 * totalmente engolido pelo clamp (ex.: somar em 100) não gera entrada — mantém
 * o log limpo. Imutável: devolve novo board + novo array.
 */
export function applyBoardDelta(
  board: number,
  log: BoardLogEntry[] | undefined,
  split: number,
  delta: number,
  reason: string,
): { board: number; boardLog: BoardLogEntry[] } {
  const before = Math.max(0, Math.min(100, board));
  const after = Math.max(0, Math.min(100, before + delta));
  const current = log ?? [];
  if (after === before) return { board: after, boardLog: current };
  const effective = Math.round((after - before) * 10) / 10;
  const next = [{ split, delta: effective, reason }, ...current];
  return { board: after, boardLog: next.slice(0, BOARD_LOG_CAP) };
}

/**
 * Compõe o detalhe da demissão a partir dos eventos NEGATIVOS mais recentes
 * do log ("Derrota 0-2 vs NAVI; Objetivo falhou: top 4; ..."). Vazio quando
 * não há rastro (save antigo) — o caller cai no texto genérico.
 */
export function boardFiredDetail(log: BoardLogEntry[] | undefined, max = 4): string {
  return (log ?? [])
    .filter((e) => e.delta < 0 && e.reason)
    .slice(0, max)
    .map((e) => e.reason)
    .join('; ');
}

// tom do medidor de confiança na UI (mesma régua do fired em <=12)
export function boardTone(board: number): 'ok' | 'warn' | 'danger' {
  if (board >= 55) return 'ok';
  if (board >= 30) return 'warn';
  return 'danger';
}
