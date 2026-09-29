// [integração · fase 3] Fundação da carreira: o elenco escolhido no desafio (ou
// montado no Custom) só vira contrato quando você confirma no mercado da
// fundação. Até lá o save marca `foundingOpen` — e um F5 no meio volta pro
// mercado em vez de pular pra escolha do campeonato sem contratos.
export interface FoundingSave {
  squad: { playerId: string }[];
  coachFromId: string | null;
  foundingOpen?: boolean;
}

/** O save precisa (voltar a) passar pelo mercado antes de jogar? */
export function needsMarket(s: FoundingSave): boolean {
  return s.squad.length < 5 || !s.coachFromId || !!s.foundingOpen;
}
