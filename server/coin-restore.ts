// Aritmética pura da recuperação de coins comprados (Ultimate Squad).
// Regra: cada coin comprado (pedido claimed) pode ser RE-EMITIDO no máximo 1×
// pra quem perdeu o save local. O restorável é o que foi comprado menos o que
// já foi re-emitido (rtm_coin_restores) — nunca negativo.
export function restorableCoins(purchased: number[], restored: number[]): number {
  const sum = (xs: number[]) => xs.reduce((acc, x) => acc + (Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0), 0);
  return Math.max(0, sum(purchased) - sum(restored));
}
