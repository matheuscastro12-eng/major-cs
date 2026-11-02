// [fase 3] Save da Carreira v28 → v29: grava o bloco `clube` (vestiário,
// contratos completos, negociações e mercado) com os padrões de cada frente.
// Idempotente. O `contracts` antigo continua no save até a frente de contratos
// migrar todo leitor para `clube.contracts`.
import type { ClubeState } from './model';
import { defaultDressingRoom } from './vestiario';
import { defaultContracts } from './contratos';
import { defaultMarket } from './mercado';

type Save = Record<string, unknown> & { clube?: ClubeState };

export function migrateClube(save: Save): Save {
  if (save.clube && (save.clube as ClubeState).v === 1) return save;
  const clube: ClubeState = {
    v: 1,
    dressing: defaultDressingRoom(save),
    contracts: defaultContracts(save),
    negotiations: [],
    market: defaultMarket(save),
  };
  return { ...save, clube };
}
