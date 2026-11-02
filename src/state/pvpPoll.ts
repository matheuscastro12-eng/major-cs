// [ULT-ON] Erro do poll da partida PvP: quando mostrar ao jogador.
//
// O primeiro matchStart das duas pontas costuma cair numa instância fria da
// função: ela roda o DDL do ult_match/lobbies antes da ação e, com os dois
// jogadores chegando juntos, uma das requisições pode perder a corrida (lock,
// deadlock ou compute do Neon acordando) e voltar 500/503. O próximo poll já
// passa. Mostrar esse erro isolado fazia piscar "Erro interno. Tente de novo em
// instantes." na tela de "Conectando…". Regra: falha transitória (5xx, 409
// "ocupada", 429 ou rede) só aparece depois de algumas falhas SEGUIDAS; erro
// definitivo (403/404 e outros 4xx) aparece na hora.
export const PVP_TRANSIENT_FAILS_BEFORE_ERROR = 3;

export function isTransientPollStatus(status: number | null): boolean {
  if (status == null) return true; // sem resposta (rede/timeout)
  return status >= 500 || status === 409 || status === 429 || status === 408;
}

export function pollErrorVisible(consecutiveFails: number, status: number | null): boolean {
  if (consecutiveFails <= 0) return false;
  if (!isTransientPollStatus(status)) return true;
  return consecutiveFails >= PVP_TRANSIENT_FAILS_BEFORE_ERROR;
}
