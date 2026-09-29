// [fase 2 · frente STAFF] Esqueleto do contrato — a frente de comissão técnica implementa.
import type { StaffState, StaffEffects, TrainingSession } from './model';

export function defaultStaff(): StaffState {
  return { v: 1, members: [] };
}

const SESSIONS: TrainingSession[] = ['aim', 'utility', 'tactics', 'vod', 'scrim', 'physical', 'mental', 'rest'];

// Linha de base: sem comissão técnica, nada muda em relação ao jogo atual.
export function staffEffects(_staff: StaffState | null | undefined): StaffEffects {
  return {
    training: Object.fromEntries(SESSIONS.map((s) => [s, 1])) as StaffEffects['training'],
    familiarityGain: 1, antiStratRead: 0, scoutAccuracy: 0, moraleRecovery: 1, injuryRisk: 1, injuryRecovery: 1, youthGrowth: 1,
  };
}
