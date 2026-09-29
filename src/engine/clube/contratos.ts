// [fase 3 · frente CONTRATOS] Esqueleto do contrato — a frente de contratos implementa.
import type { ContractTerms } from './model';

// Converte o `contracts` antigo (playerId → split final) em termos completos.
// A frente de contratos preenche salário/cláusulas a partir do jogador e do tier.
export function defaultContracts(save?: Record<string, unknown>): Record<string, ContractTerms> {
  const old = (save?.contracts ?? {}) as Record<string, number>;
  const out: Record<string, ContractTerms> = {};
  for (const [id, until] of Object.entries(old)) if (typeof until === 'number') out[id] = { wage: 0, until };
  return out;
}
