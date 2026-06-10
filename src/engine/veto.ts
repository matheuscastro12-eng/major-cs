import type { MapId, TTeam } from '../types';
import { MAP_POOL } from '../types';
import type { Rng } from './rng';

export type VetoActionType = 'ban' | 'pick' | 'decider';

export interface VetoStep {
  team: 0 | 1 | -1; // -1 = decider automático
  action: VetoActionType;
  map?: MapId;
}

// Ordem oficial de veto MD3: A ban, B ban, A pick, B pick, B ban, A ban, decider
export const VETO_ORDER: { team: 0 | 1 | -1; action: VetoActionType }[] = [
  { team: 0, action: 'ban' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'pick' },
  { team: 1, action: 'pick' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'ban' },
  { team: -1, action: 'decider' },
];

export interface VetoState {
  steps: VetoStep[]; // passos já realizados
  remaining: MapId[];
}

export function newVeto(): VetoState {
  return { steps: [], remaining: [...MAP_POOL] };
}

export function vetoDone(v: VetoState): boolean {
  return v.steps.length >= VETO_ORDER.length;
}

export function currentStep(v: VetoState): { team: 0 | 1 | -1; action: VetoActionType } {
  return VETO_ORDER[v.steps.length];
}

export function applyVeto(v: VetoState, map: MapId): VetoState {
  const step = currentStep(v);
  const steps = [...v.steps, { ...step, map }];
  const remaining = v.remaining.filter((m) => m !== map);
  const next = { steps, remaining };
  // decider automático
  if (steps.length === VETO_ORDER.length - 1) {
    return { steps: [...steps, { team: -1, action: 'decider', map: remaining[0] }], remaining: [] };
  }
  return next;
}

// IA escolhe: ban no mapa onde está pior em relação ao oponente; pick onde está melhor
export function aiChoice(v: VetoState, teams: [TTeam, TTeam], rng: Rng): MapId {
  const step = currentStep(v);
  const me = teams[step.team === 1 ? 1 : 0];
  const opp = teams[step.team === 1 ? 0 : 1];
  const scored = v.remaining.map((m) => ({
    m,
    edge: (me.mapPrefs[m] ?? 0) - (opp.mapPrefs[m] ?? 0) + (rng() - 0.5) * 0.8,
  }));
  scored.sort((a, b) => (step.action === 'pick' ? b.edge - a.edge : a.edge - b.edge));
  return scored[0].m;
}

export function vetoMaps(v: VetoState): { map: MapId; pickedBy: 0 | 1 | -1 }[] {
  const picks = v.steps.filter((s) => s.action === 'pick' || s.action === 'decider');
  return picks.map((s) => ({ map: s.map!, pickedBy: s.action === 'decider' ? -1 : (s.team as 0 | 1) }));
}

// veto completo automático (partidas IA vs IA)
export function autoVeto(teams: [TTeam, TTeam], rng: Rng): { map: MapId; pickedBy: 0 | 1 | -1 }[] {
  let v = newVeto();
  while (!vetoDone(v)) {
    v = applyVeto(v, aiChoice(v, teams, rng));
  }
  return vetoMaps(v);
}
