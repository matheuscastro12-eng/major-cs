// [fase 3 · frente MERCADO] Pontes com as outras frentes da fase 3.
//
// O mercado usa respostas que pertencem a outras frentes:
//   - releaseClauseOf(save, playerId)  → frente H (contratos): multa rescisória
//     do SEU jogador. Proposta da IA ≥ cláusula = você não pode recusar.
//   - contractWageOf(save, id, mercado) → frente H: salário do contrato (cai no de
//     mercado enquanto o contrato migrado não foi materializado).
//   - wantsToLeave(save, playerId)     → frente G (vestiário): pedido de saída.
//     Recusar proposta por quem quer sair gera insatisfação.
//   - leaveRequests(save, squadIds)    → frente G: quem pediu pra sair (prioriza propostas).
//   - benchValueFactor(dressing, id)   → frente G: 0,85–1, a IA paga menos por quem vive no banco.
//   - SQUAD_MAX                        → frente G: o seu elenco vai até 7 (5 + banco).
//
// [integração] os stubs da frente I viraram re-export das funções reais.
export { releaseClauseOf, contractWageOf } from './contratos';
export { wantsToLeave, leaveRequests, benchValueFactor, SQUAD_MAX } from './vestiario';
