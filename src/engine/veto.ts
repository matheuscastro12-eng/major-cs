import type { MapId, TTeam } from '../types';
import { MAP_POOL } from '../types';
import type { Rng } from './rng';

export type VetoActionType = 'ban' | 'pick' | 'decider';

export interface VetoStep {
  team: 0 | 1 | -1; // -1 = decider automático
  action: VetoActionType;
  map?: MapId;
}

// Ordem oficial MD3: A ban, B ban, A pick, B pick, B ban, A ban, decider
export const VETO_ORDER_BO3: { team: 0 | 1 | -1; action: VetoActionType }[] = [
  { team: 0, action: 'ban' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'pick' },
  { team: 1, action: 'pick' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'ban' },
  { team: -1, action: 'decider' },
];

// Ordem MD1: só bans alternados até sobrar 1 (o decider)
export const VETO_ORDER_BO1: { team: 0 | 1 | -1; action: VetoActionType }[] = [
  { team: 0, action: 'ban' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'ban' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'ban' },
  { team: 1, action: 'ban' },
  { team: -1, action: 'decider' },
];

// Ordem MD5: A ban, B ban, depois 4 picks alternados + decider (joga 5 mapas)
export const VETO_ORDER_BO5: { team: 0 | 1 | -1; action: VetoActionType }[] = [
  { team: 0, action: 'ban' },
  { team: 1, action: 'ban' },
  { team: 0, action: 'pick' },
  { team: 1, action: 'pick' },
  { team: 0, action: 'pick' },
  { team: 1, action: 'pick' },
  { team: -1, action: 'decider' },
];

export type BestOf = 1 | 3 | 5;

export function vetoOrder(bestOf: BestOf): { team: 0 | 1 | -1; action: VetoActionType }[] {
  return bestOf === 1 ? VETO_ORDER_BO1 : bestOf === 5 ? VETO_ORDER_BO5 : VETO_ORDER_BO3;
}

// compat: alguns lugares ainda importam VETO_ORDER (= BO3)
export const VETO_ORDER = VETO_ORDER_BO3;

export interface VetoState {
  steps: VetoStep[]; // passos já realizados
  remaining: MapId[];
  bestOf: BestOf;
}

export function newVeto(bestOf: BestOf = 3): VetoState {
  return { steps: [], remaining: [...MAP_POOL], bestOf };
}

export function vetoDone(v: VetoState): boolean {
  return v.steps.length >= vetoOrder(v.bestOf).length;
}

export function currentStep(v: VetoState): { team: 0 | 1 | -1; action: VetoActionType } {
  return vetoOrder(v.bestOf)[v.steps.length];
}

export function applyVeto(v: VetoState, map: MapId): VetoState {
  const order = vetoOrder(v.bestOf);
  const step = order[v.steps.length];
  const steps = [...v.steps, { ...step, map }];
  const remaining = v.remaining.filter((m) => m !== map);
  const next = { ...v, steps, remaining };
  // decider automático (último mapa que sobra)
  if (steps.length === order.length - 1) {
    return { ...v, steps: [...steps, { team: -1, action: 'decider', map: remaining[0] }], remaining: [] };
  }
  return next;
}

// Contexto de win-rate REAL por mapa (saída de teamMapStats), por índice de time.
// Em geral só temos o do usuário — a IA usa isso como "scouting" da sua run.
export interface VetoStatsCtx {
  byTeam: Partial<Record<0 | 1, Record<string, { winRate: number; games: number }>>>;
  minGames?: number; // amostra mínima pra pesar (default 2)
}

// IA escolhe: ban no mapa onde está pior em relação ao oponente; pick onde está
// melhor. Quando recebe `statsCtx` (histórico real da carreira), incorpora o
// win-rate por mapa: a IA passa a BANIR os SEUS mapas fortes e te dar de pick os
// fracos — o veto ganha memória da run, em vez de seguir só os mapPrefs estáticos.
export function aiChoice(v: VetoState, teams: [TTeam, TTeam], rng: Rng, statsCtx?: VetoStatsCtx): MapId {
  const step = currentStep(v);
  const meIdx: 0 | 1 = step.team === 1 ? 1 : 0;
  const oppIdx: 0 | 1 = meIdx === 0 ? 1 : 0;
  const me = teams[meIdx];
  const opp = teams[oppIdx];
  const minGames = statsCtx?.minGames ?? 2;
  // win-rate normalizado -1..+1 (50% = 0), só com amostra suficiente
  const wr = (idx: 0 | 1, m: MapId): number => {
    const rec = statsCtx?.byTeam?.[idx]?.[m];
    if (!rec || rec.games < minGames) return 0;
    return (rec.winRate - 50) / 50;
  };
  const K = 1.6; // peso do histórico real frente aos mapPrefs base
  const scored = v.remaining.map((m) => ({
    m,
    edge:
      (me.mapPrefs[m] ?? 0) - (opp.mapPrefs[m] ?? 0) +
      (wr(meIdx, m) - wr(oppIdx, m)) * K +
      (rng() - 0.5) * 0.8,
  }));
  scored.sort((a, b) => (step.action === 'pick' ? b.edge - a.edge : a.edge - b.edge));
  return scored[0].m;
}

export function vetoMaps(v: VetoState): { map: MapId; pickedBy: 0 | 1 | -1 }[] {
  const picks = v.steps.filter((s) => s.action === 'pick' || s.action === 'decider');
  return picks.map((s) => ({ map: s.map!, pickedBy: s.action === 'decider' ? -1 : (s.team as 0 | 1) }));
}

// veto completo automático (partidas IA vs IA)
export function autoVeto(teams: [TTeam, TTeam], rng: Rng, bestOf: BestOf = 3): { map: MapId; pickedBy: 0 | 1 | -1 }[] {
  let v = newVeto(bestOf);
  while (!vetoDone(v)) {
    v = applyVeto(v, aiChoice(v, teams, rng));
  }
  return vetoMaps(v);
}
