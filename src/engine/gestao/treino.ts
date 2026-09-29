// [fase 2 · frente TREINO] Esqueleto do contrato — a frente de treino implementa.
import type { TrainingState, PlayerCondition } from './model';

export function defaultTrainingState(): TrainingState {
  return { v: 1, week: ['aim', 'tactics', 'scrim', 'vod', 'utility', 'physical', 'rest'], intensity: 'normal', focus: {}, mapFocus: [] };
}

export function defaultCondition(): PlayerCondition {
  return { fitness: 100, sharpness: 70, injury: null };
}
