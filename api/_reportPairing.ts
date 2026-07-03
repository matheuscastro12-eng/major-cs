// Pareamento de reports de ranqueada (PvP Ultimate) — lógica PURA, testada em
// server/ranked-report.test.ts. O handler (api/ranking.ts) só orquestra SQL.
//
// Modelo: cada jogador reporta 1x por partida (PK code+email). O ELO só é
// aplicado quando os DOIS reports existem e são consistentes (exatamente um
// venceu). Reports iguais dos dois lados = conflito: a partida não conta.
// Se o oponente nunca reportar, o report solo é aplicado após a carência
// (GRACE_MS) — melhor perder pro rage-quit do que travar o ladder.

export const GRACE_MS = 10 * 60_000;

export type PairOutcome = 'wait' | 'apply-both' | 'apply-mine' | 'conflict';

// Decide o que fazer quando MEU report chega e o estado do report do oponente
// é conhecido. `theirStatus` = null quando o oponente ainda não reportou.
export function decidePair(
  myWon: boolean,
  theirWon: boolean | null,
  theirStatus: 'pending' | 'applied' | 'applied-solo' | 'conflict' | null,
): PairOutcome {
  if (theirWon == null || theirStatus == null) return 'wait';
  // oponente conflitou numa dupla anterior — não deveria existir com PK, mas
  // por segurança: não aplica nada em cima de partida já marcada como suja.
  if (theirStatus === 'conflict') return 'conflict';
  if (myWon === theirWon) return 'conflict';
  // consistente: se o dele já foi aplicado no solo (carência), só o meu entra.
  return theirStatus === 'applied-solo' ? 'apply-mine' : 'apply-both';
}

// Delta de MMR de UM jogador (mesma fórmula do report legado): K maior na
// colocação; derrota nunca leva o MMR abaixo de 0.
export function rankedDelta(
  won: boolean,
  mmrBefore: number,
  seasonGames: number,
  opts: { placementGames: number; kWin: number; kLoss: number; kPlace: number },
): number {
  const placing = seasonGames < opts.placementGames;
  const k = placing ? opts.kPlace : won ? opts.kWin : opts.kLoss;
  const loss = Math.min(k, Math.max(0, mmrBefore));
  return won ? k : loss === 0 ? 0 : -loss; // evita -0 (MMR zerado perde 0)
}

// Report solo pendente pode ser aplicado? (carência vencida e sem contraparte)
export function soloGraceExpired(reportedAtMs: number, nowMs: number, graceMs = GRACE_MS): boolean {
  return nowMs - reportedAtMs >= graceMs;
}
