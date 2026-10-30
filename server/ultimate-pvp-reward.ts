// [F1] Prêmio da ranqueada do Ultimate creditado NO SERVIDOR. Forma mínima:
// o servidor credita a partir de um resultado que ELE confirmou (report
// pareado e consistente em api/ranking.ts — os dois lados concordam), nunca do
// `won` solto de um cliente. Idempotente por partida: op_id `pvp-ranked:<code>`
// no ledger da conta (UNIQUE email+op_id) — retry/report duplicado não paga 2×.
// A Fase 2 troca a fonte do resultado pela partida resolvida no servidor.
import { applyUltTransaction, type SqlTag, type UltTxResult } from './ultimate-economy.js';

// vitória ranqueada: piso do computeMatchOutcome do cliente (500 sem bônus de
// divisão/sequência — conservador até o servidor conhecer esses dados).
export const RANKED_WIN_CREDITS = 500;
export const RANKED_LOSS_CREDITS = 0;

export function rankedRewardOpId(code: string): string {
  return `pvp-ranked:${code}`;
}

export function rankedRewardCredits(won: boolean): number {
  return won ? RANKED_WIN_CREDITS : RANKED_LOSS_CREDITS;
}

// Credita (ou não, se derrota vale 0) o prêmio de UMA partida confirmada.
export async function creditRankedPvpReward(sql: SqlTag, email: string, code: string, won: boolean): Promise<UltTxResult | null> {
  const credits = rankedRewardCredits(won);
  if (credits <= 0) return null;
  return applyUltTransaction(sql, email, {
    opId: rankedRewardOpId(code),
    kind: 'reward',
    creditsDelta: credits,
    cards: [],
    meta: { source: 'ranked-pvp', code, won },
  });
}
