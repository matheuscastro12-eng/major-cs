// [FIX29] Duelo do Ultimate: o "o draft já começou" vermelho aparecia DURANTE a
// partida. Causa: o host toca INICIAR DUELO, o servidor já muda a sala pra
// 'drafting', mas o cliente só enxerga isso no próximo poll (até 3,5s). Nesse
// intervalo o botão continua lá: 2º toque (duplo clique, toque duplo no
// celular, clique impaciente) → 409 "o draft já começou" → setError. Nada limpava
// esse erro, e a tela ao vivo da partida também renderiza `error`: o aviso
// ficava na partida inteira. Aqui ficam as regras puras (testadas).

/** mensagem do servidor quando a sala já saiu de 'waiting' (api/lobby.ts start/join) */
export const DRAFT_STARTED_ERR = 'o draft já começou';

/** 409 "já começou" num START não é erro pro host: o duelo que ele pediu está rolando */
export function startResultError(r: { ok?: boolean; error?: string } | null | undefined, fallback: string): string {
  if (r?.ok) return '';
  if (r?.error === DRAFT_STARTED_ERR) return '';
  return r?.error ?? fallback;
}

type Status = 'waiting' | 'drafting' | 'veto' | 'done';

/**
 * Erro da fase de sala que não vale mais quando a sala avança: ao sair de
 * 'waiting' (draft começou / partida pronta), um "já começou" é obsoleto.
 * Erros de squad e de partida (versão incompatível) continuam valendo.
 */
export function staleRoomError(error: string, prev: Status | undefined, next: Status | undefined): boolean {
  if (!error || !next || prev === next) return false;
  if (next === 'waiting') return false;
  return error === DRAFT_STARTED_ERR;
}
