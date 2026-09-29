// [fase 3 · frente MERCADO] Pontes com as outras frentes da fase 3.
//
// O mercado precisa de duas respostas que pertencem a outras frentes:
//   - releaseClauseOf(save, playerId)  → frente H (contratos): multa rescisória
//     do SEU jogador. Proposta da IA ≥ cláusula = você não pode recusar.
//   - wantsToLeave(save, playerId)     → frente G (vestiário): o jogador quer
//     sair? Recusar proposta por quem quer sair gera insatisfação.
//
// Enquanto as frentes H e G não entregam, estes STUBS têm a MESMA assinatura e
// leem o que já existe no save. Na integração, troque o corpo pelo re-export:
//   export { releaseClauseOf } from './contratos';
//   export { wantsToLeave } from './vestiario';
// (registrado em "Mudanças de contrato" no docs/realismo-fm-fase3.md).
import type { ClubeState } from './model';

type SaveLike = {
  clube?: ClubeState;
  morale?: Record<string, number>;
  satisfaction?: Record<string, number>;
  [key: string]: unknown;
};

// Stub da frente H: a cláusula gravada no contrato completo (clube.contracts).
// Sem contrato completo ou sem cláusula → null (sem cláusula, nada é forçado).
export function releaseClauseOf(save: SaveLike, playerId: string): number | null {
  const c = save.clube?.contracts?.[playerId]?.releaseClause;
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : null;
}

// Stub da frente G: quer sair quem está com a moral no chão (o mesmo corte de
// 32 que a Carreira usa pra listar "insatisfeitos" no fechamento do split) ou
// com a satisfação composta muito baixa.
export const WANTS_TO_LEAVE_MORALE = 32;
export function wantsToLeave(save: SaveLike, playerId: string): boolean {
  const morale = save.morale?.[playerId];
  const sat = save.satisfaction?.[playerId];
  return (typeof morale === 'number' && morale < WANTS_TO_LEAVE_MORALE)
    || (typeof sat === 'number' && sat < WANTS_TO_LEAVE_MORALE);
}
