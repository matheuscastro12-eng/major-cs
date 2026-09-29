// [fase 2 · frente TÁTICA] Esqueleto do contrato — a frente de tática implementa.
import type { TacticsState, TacticDuelMods } from './model';

export function defaultTactics(): TacticsState {
  return {
    v: 1,
    instr: { tempo: 'balanced', utility: 'balanced', ecoPolicy: 'forceAfterPistol', aggression: 'balanced', timeoutPolicy: 'normal' },
    maps: {},
    antiStrat: null,
  };
}

// Sem tática configurada, o motor joga exatamente como hoje.
export const NEUTRAL_TACTIC_MODS: TacticDuelMods = { teamLogit: 0 };
