// [fase 2] Save da Carreira v27 → v28: grava o bloco `gestao` (treino, tática,
// comissão técnica e condição) com os padrões de cada frente. Idempotente.
import type { GestaoState } from './model';
import { defaultTrainingState, defaultCondition } from './treino';
import { defaultTactics } from './tatica';
import { defaultStaff } from './staff';

type Save = Record<string, unknown> & { gestao?: GestaoState; squad?: unknown };

export function migrateGestao(save: Save): Save {
  if (save.gestao && (save.gestao as GestaoState).v === 1) return save;
  const squad = Array.isArray(save.squad) ? (save.squad as { playerId?: string }[]) : [];
  const condition: GestaoState['condition'] = {};
  for (const s of squad) if (typeof s?.playerId === 'string') condition[s.playerId] = defaultCondition();
  const gestao: GestaoState = { v: 1, training: defaultTrainingState(), tactics: defaultTactics(), staff: defaultStaff(), condition };
  return { ...save, gestao };
}
