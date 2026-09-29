// [fase 2 · frente TREINO] Treino semanal estilo FM. Puro, determinístico, sem React.
//
// A semana tem 7 slots (`TrainingState.week`) e uma intensidade. Cada sessão
// dá PONTOS DE TREINO a um conjunto de atributos; o foco individual (um
// atributo ou uma função) redistribui os pontos do jogador; a comissão técnica
// (`staffEffects().training`) multiplica cada sessão. Os pontos acumulam no
// split e, na virada, viram um MULTIPLICADOR POR ATRIBUTO do crescimento em
// `engine/attrs/progression.ts` (`EvolveContext.trainMul`) — é lá que a idade,
// o profissionalismo (oculto) e o teto no PA continuam mandando. A agenda
// padrão em intensidade normal vale 1,0 em todo atributo: sem mexer no treino,
// a evolução é exatamente a de antes.
//
// A semana também move a CONDIÇÃO (fitness, sharpness), sorteia LESÃO e
// BURNOUT pela intensidade (risco × `staffEffects().injuryRisk`, recuperação ×
// `injuryRecovery`), dá FAMILIARIDADE aos mapas priorizados (função pública da
// frente de tática) e, nas sessões de scrim, pode VAZAR estratégia.
//
// Uma semana = uma série oficial do seu time (a Carreira avança por séries).

import { ALL_ATTRS, type AttrKey } from '../attributes';
import { hashStr } from '../../state/hash';
import { MAP_POOL, type MapId, type Role } from '../../types';
import type {
  GestaoState, IndividualFocus, InjuryKind, PlayerCondition, StaffEffects, TacticsState,
  TrainingIntensity, TrainingSession, TrainingState, TrainingWeekReport,
} from './model';
import { defaultTactics, gainFamiliarity, gainAntiStrat } from './tatica';
import { defaultStaff, staffEffects } from './staff';
import { isInjured } from './condicao';

// ─── Padrões do contrato ───────────────────────────────────────────────────
export const DEFAULT_WEEK: TrainingSession[] = ['aim', 'tactics', 'scrim', 'vod', 'utility', 'physical', 'rest'];

export function defaultTrainingState(): TrainingState {
  return { v: 1, week: [...DEFAULT_WEEK], intensity: 'normal', focus: {}, mapFocus: [], progress: {}, weeks: 0, weekNo: 0, leaks: {}, lastWeek: null };
}

/** Condição inicial; `legacyFatigue` (0–100, sistema antigo de fadiga) vira fitness. */
export function defaultCondition(legacyFatigue?: number): PlayerCondition {
  const f = typeof legacyFatigue === 'number' && Number.isFinite(legacyFatigue) ? Math.max(0, Math.min(100, legacyFatigue)) : 0;
  return { fitness: Math.round(100 - f), sharpness: 70, injury: null };
}

// ─── Sessões ───────────────────────────────────────────────────────────────
export const SESSIONS: TrainingSession[] = ['aim', 'utility', 'tactics', 'vod', 'scrim', 'physical', 'mental', 'rest'];

export interface SessionInfo {
  label: string;
  desc: string;
  load: number;     // fitness gasto (intensidade normal)
  sharp: number;    // ritmo de jogo ganho
  exposure: number; // exposição a lesão (mecânica repetitiva pesa mais)
  fam: number;      // pontos de familiaridade por mapa priorizado
}

export const SESSION_INFO: Record<TrainingSession, SessionInfo> = {
  aim: { label: 'Mira', desc: 'Deathmatch, aim training e duelos 1v1. Mecânica e reflexo.', load: 3, sharp: 1, exposure: 1.4, fam: 0 },
  utility: { label: 'Utilitária', desc: 'Granadas, execuções e coordenação de utilitária.', load: 2, sharp: 1, exposure: 0.8, fam: 1.5 },
  tactics: { label: 'Tática', desc: 'Táticas dos mapas priorizados: posicionamento, disciplina, comunicação.', load: 2, sharp: 1.5, exposure: 0.8, fam: 4 },
  vod: { label: 'VOD review', desc: 'Revisão de partidas: leitura, decisões, antecipação.', load: 1, sharp: 0.5, exposure: 0.2, fam: 1 },
  scrim: { label: 'Scrim', desc: 'Treino contra outro time: ritmo, clutch e frieza. Pode vazar estratégia.', load: 4, sharp: 3, exposure: 1.2, fam: 3 },
  physical: { label: 'Físico', desc: 'Preparação física: stamina, reflexo e prevenção de lesão.', load: 3, sharp: 0, exposure: 0.4, fam: 0 },
  mental: { label: 'Mental', desc: 'Psicólogo e foco: frieza, concentração, consistência.', load: 1, sharp: 0, exposure: 0.1, fam: 0 },
  rest: { label: 'Descanso', desc: 'Folga: recupera a condição física.', load: 0, sharp: 0, exposure: 0, fam: 0 },
};

// Pontos de treino por sessão (intensidade normal, comissão de linha de base).
export const SESSION_GAINS: Record<TrainingSession, Partial<Record<AttrKey, number>>> = {
  aim: {
    aim: 1, tap: 1, spray: 1, headshot: 1, crosshair: 1, preAim: 0.8, aimMovement: 0.8,
    awp: 0.8, reflexes: 0.6, reaction: 0.6, offAngles: 0.5, apm: 0.4,
  },
  utility: { coordination: 1, teamwork: 0.8, positioning: 0.6, decisions: 0.5, vision: 0.5, communication: 0.4, apm: 0.4 },
  tactics: {
    positioning: 1, gameSense: 0.8, teamwork: 0.8, discipline: 0.8, vision: 0.6, communication: 0.6,
    leadership: 0.5, anticipation: 0.5,
  },
  vod: { gameSense: 1, decisions: 1, anticipation: 1, vision: 0.8, adaptability: 0.8, offAngles: 0.4, consistency: 0.4 },
  scrim: {
    clutch: 0.8, decisions: 0.6, composure: 0.6, teamwork: 0.6, communication: 0.6, adaptability: 0.6,
    consistency: 0.5, leadership: 0.4, aim: 0.3, spray: 0.3, crosshair: 0.3, awp: 0.3, preAim: 0.3,
  },
  physical: { stamina: 1.5, reflexes: 0.5, reaction: 0.5, concentration: 0.6, coordination: 0.4 },
  mental: { composure: 1.2, concentration: 1.2, clutch: 0.8, consistency: 0.8, discipline: 0.6, adaptability: 0.4 },
  rest: {},
};

export const INTENSITY: Record<TrainingIntensity, { label: string; gain: number; load: number; injury: number }> = {
  low: { label: 'Leve', gain: 0.75, load: 0.6, injury: 0.45 },
  normal: { label: 'Normal', gain: 1, load: 1, injury: 1 },
  high: { label: 'Intensa', gain: 1.3, load: 1.2, injury: 1.8 },
};

const NEUTRAL_STAFF: StaffEffects = staffEffects(null);

/** Pontos de UMA sessão (intensidade × comissão). */
export function sessionGains(session: TrainingSession, intensity: TrainingIntensity = 'normal', staff: StaffEffects = NEUTRAL_STAFF): Partial<Record<AttrKey, number>> {
  const mul = INTENSITY[intensity].gain * (staff.training[session] ?? 1);
  const out: Partial<Record<AttrKey, number>> = {};
  for (const [k, v] of Object.entries(SESSION_GAINS[session]) as [AttrKey, number][]) out[k] = v * mul;
  return out;
}

/** Pontos da semana inteira (sem foco individual). */
export function weekGains(week: TrainingSession[], intensity: TrainingIntensity = 'normal', staff: StaffEffects = NEUTRAL_STAFF): Record<AttrKey, number> {
  const out = Object.fromEntries(ALL_ATTRS.map((k) => [k, 0])) as Record<AttrKey, number>;
  for (const s of week) for (const [k, v] of Object.entries(sessionGains(s, intensity, staff)) as [AttrKey, number][]) out[k] += v;
  return out;
}

// Régua: a agenda padrão, intensidade normal, comissão de base = 1,0 em tudo.
export const REF_WEEK_GAINS: Record<AttrKey, number> = weekGains(DEFAULT_WEEK);

// ─── Foco individual ───────────────────────────────────────────────────────
export const ROLE_FOCUS_ATTRS: Record<Role, AttrKey[]> = {
  AWP: ['awp', 'reaction', 'reflexes', 'positioning', 'composure', 'anticipation'],
  IGL: ['leadership', 'communication', 'gameSense', 'decisions', 'vision', 'adaptability'],
  Entry: ['aim', 'aimMovement', 'reaction', 'reflexes', 'headshot', 'coordination'],
  Rifler: ['aim', 'spray', 'crosshair', 'headshot', 'preAim', 'positioning'],
  Support: ['teamwork', 'coordination', 'communication', 'positioning', 'discipline', 'decisions'],
  Lurker: ['clutch', 'anticipation', 'positioning', 'offAngles', 'composure', 'gameSense'],
};

export const FOCUS_ATTR_MUL = 2.2;   // o atributo em foco
export const FOCUS_ATTR_REST = 0.93; // o resto cede um pouco do tempo
export const FOCUS_ROLE_MUL = 1.45;
export const FOCUS_ROLE_REST = 0.9;

export function focusMul(focus: IndividualFocus | null | undefined, k: AttrKey): number {
  if (!focus) return 1;
  if (focus.kind === 'attr') return focus.attr === k ? FOCUS_ATTR_MUL : FOCUS_ATTR_REST;
  return (ROLE_FOCUS_ATTRS[focus.role] ?? []).includes(k) ? FOCUS_ROLE_MUL : FOCUS_ROLE_REST;
}

/** Pontos da semana de UM jogador (agenda × intensidade × comissão × foco). */
export function playerWeekPoints(
  training: Pick<TrainingState, 'week' | 'intensity'>,
  focus: IndividualFocus | null | undefined,
  staff: StaffEffects = NEUTRAL_STAFF,
): Record<AttrKey, number> {
  const g = weekGains(training.week, training.intensity, staff);
  for (const k of ALL_ATTRS) g[k] *= focusMul(focus, k);
  return g;
}

export const TRAIN_MUL_MIN = 0.4;
export const TRAIN_MUL_MAX = 2.2;

/**
 * Multiplicador de crescimento por atributo do split (entra no
 * `EvolveContext.trainMul`). Sem semana registrada → undefined (neutro).
 */
export function trainingGrowthMul(progress: Partial<Record<AttrKey, number>> | undefined, weeks: number | undefined): Partial<Record<AttrKey, number>> | undefined {
  if (!progress || !weeks || weeks <= 0) return undefined;
  const out: Partial<Record<AttrKey, number>> = {};
  for (const k of ALL_ATTRS) {
    const ref = REF_WEEK_GAINS[k] * weeks;
    const v = ref > 0 ? (progress[k] ?? 0) / ref : 1;
    out[k] = Math.round(Math.max(TRAIN_MUL_MIN, Math.min(TRAIN_MUL_MAX, v)) * 100) / 100;
  }
  return out;
}

/** Previsão (para a tela) do multiplicador que a agenda atual daria a um jogador. */
export function previewGrowthMul(training: Pick<TrainingState, 'week' | 'intensity'>, focus: IndividualFocus | null | undefined, staff?: StaffEffects): Partial<Record<AttrKey, number>> {
  return trainingGrowthMul(playerWeekPoints(training, focus, staff), 1) ?? {};
}

// ─── Condição, lesão e burnout ─────────────────────────────────────────────
export const BASE_RECOVERY = 6;      // fitness recuperado por semana só de dormir/rotina
export const REST_RECOVERY = 9;      // cada dia de descanso
export const SHARP_DECAY = 0.17;     // ritmo perdido por semana (proporcional)
export const SHARP_PER_MAP = 2.5;    // ritmo por mapa oficial jogado
export const INJURY_BASE = 0.012;    // chance semanal de lesão (semana padrão, normal, fitness ok)
export const BURNOUT_FITNESS = 12;   // abaixo disso o burnout vira sorteio semanal
export const BURNOUT_CHANCE = 0.25;
export const INJURED_RECOVERY = 10;  // fitness recuperado por semana parado

const REF_EXPOSURE = DEFAULT_WEEK.reduce((s, x) => s + SESSION_INFO[x].exposure, 0);

export const INJURY_LABEL: Record<InjuryKind, string> = {
  wrist: 'Punho (LER)', tendon: 'Tendinite', back: 'Lombar', burnout: 'Burnout', illness: 'Doença',
};

/** Variação semanal de fitness pelo treino (sem partidas). */
export function weekFitnessDelta(training: Pick<TrainingState, 'week' | 'intensity'>): number {
  const load = training.week.reduce((s, x) => s + SESSION_INFO[x].load, 0) * INTENSITY[training.intensity].load;
  const rest = training.week.filter((x) => x === 'rest').length;
  return BASE_RECOVERY + rest * REST_RECOVERY - load;
}

/** Ritmo que o treino da semana dá (sem partidas). */
export function weekSharpGain(training: Pick<TrainingState, 'week'>): number {
  return training.week.reduce((s, x) => s + SESSION_INFO[x].sharp, 0);
}

/**
 * Chance semanal de lesão de um jogador. `proneness` = atributo oculto 1–20
 * (10 = médio); `maps` = mapas oficiais jogados na semana.
 */
export function weeklyInjuryRisk(
  training: Pick<TrainingState, 'week' | 'intensity'>,
  fitness: number,
  proneness = 10,
  staff: StaffEffects = NEUTRAL_STAFF,
  maps = 0,
): number {
  const exposure = training.week.reduce((s, x) => s + SESSION_INFO[x].exposure, 0) / REF_EXPOSURE + maps * 0.08;
  const fitMul = 1 + Math.max(0, 55 - fitness) / 25;
  const prone = 0.5 + Math.max(1, Math.min(20, proneness)) / 20;
  const physical = training.week.filter((x) => x === 'physical').length;
  const physMul = Math.max(0.6, 1 - 0.12 * physical);
  return Math.min(0.6, INJURY_BASE * exposure * INTENSITY[training.intensity].injury * fitMul * prone * physMul * (staff.injuryRisk ?? 1));
}

const unit = (seed: string) => (hashStr(seed) % 100_000) / 100_000;

function pickInjury(seed: string, week: TrainingSession[]): { kind: InjuryKind; weeks: number } {
  const aimDays = week.filter((x) => x === 'aim' || x === 'scrim').length;
  const w: [InjuryKind, number][] = [['wrist', 0.2 + 0.06 * aimDays], ['tendon', 0.15 + 0.03 * aimDays], ['back', 0.2], ['illness', 0.25]];
  const tot = w.reduce((s, [, x]) => s + x, 0);
  let r = unit(`${seed}:kind`) * tot;
  let kind: InjuryKind = 'illness';
  for (const [k, x] of w) { if (r < x) { kind = k; break; } r -= x; }
  const span: Record<InjuryKind, [number, number]> = { wrist: [2, 4], tendon: [3, 5], back: [1, 3], illness: [1, 2], burnout: [2, 3] };
  const [lo, hi] = span[kind];
  return { kind, weeks: lo + Math.floor(unit(`${seed}:weeks`) * (hi - lo + 1)) };
}

// ─── Familiaridade e anti-strat (frente de tática) ────────────────────────
// `gainFamiliarity(tactics, map, points)` de gestao/tatica.ts: retorno
// decrescente perto de 100, cria o plano padrão do mapa (familiaridade 50).
// O DECAIMENTO sem uso não é daqui: roda uma vez só, no fim de cada série
// (`tacticsAfterMatch`). O VOD da semana prepara o anti-strat (`gainAntiStrat`).
export type GainFamiliarity = (tactics: TacticsState, map: MapId, points: number) => TacticsState;

/** Prontidão de anti-strat por sessão de VOD (intensidade normal). */
export const VOD_PREP = 8;

/** Pontos de prontidão de anti-strat que o VOD da agenda rende numa semana. */
export function vodPrepPoints(training: Pick<TrainingState, 'week' | 'intensity'>): number {
  const n = training.week.filter((x) => x === 'vod').length;
  return Math.round(n * VOD_PREP * INTENSITY[training.intensity].gain);
}

/** Pontos de familiaridade por mapa priorizado numa semana. */
export function weekFamiliarityPoints(training: Pick<TrainingState, 'week' | 'intensity' | 'mapFocus'>, staff: StaffEffects = NEUTRAL_STAFF): number {
  const maps = training.mapFocus.length;
  if (!maps) return 0;
  const raw = training.week.reduce((s, x) => s + SESSION_INFO[x].fam, 0) * INTENSITY[training.intensity].gain * (staff.familiarityGain ?? 1);
  // dividir o treino entre mais mapas rende menos em cada (1 mapa: 100%, 3: ~69%)
  return Math.round((raw / (0.55 + 0.45 * maps)) * 10) / 10;
}

// ─── Vazamento em scrim ────────────────────────────────────────────────────
export const LEAK_CHANCE_SESSION = 0.08; // por sessão de scrim na agenda
export const LEAK_CHANCE_REAL = 0.3;     // scrim marcada contra um time do seu circuito
export const LEAK_DECAY = 0.8;           // por semana

export function decayLeaks(leaks: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(leaks ?? {})) {
    const n = Math.round(v * LEAK_DECAY * 100) / 100;
    if (n >= 0.05) out[id] = n;
  }
  return out;
}

export function leakAgainst(training: Pick<TrainingState, 'leaks'> | null | undefined, teamId: string): number {
  return Math.max(0, Math.min(1, training?.leaks?.[teamId] ?? 0));
}

// ─── A semana ──────────────────────────────────────────────────────────────
export interface WeekPlayer {
  id: string;
  nick: string;
  /** atributo oculto injuryProneness 1–20 (ausente = 10) */
  proneness?: number;
}

export interface WeekInput {
  training: TrainingState;
  condition: Record<string, PlayerCondition>;
  tactics: TacticsState;
  players: WeekPlayer[];
  /** mapas oficiais jogados na semana por jogador (quem não jogou fica fora) */
  maps: Record<string, number>;
  staff?: StaffEffects;
  split: number;
  /** times que podem receber o vazamento das scrims da agenda (seu circuito) */
  leakTargets?: string[];
}

export interface WeekOutput {
  training: TrainingState;
  condition: Record<string, PlayerCondition>;
  tactics: TacticsState;
  report: TrainingWeekReport;
}

const clampC = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

/**
 * Uma semana de treino. Não muta a entrada. Ordem: lesionados se recuperam
 * (× `injuryRecovery`), quem está bem treina (pontos por atributo, fitness,
 * ritmo), sorteio de lesão/burnout, familiaridade dos mapas, vazamento.
 */
export function runTrainingWeek(input: WeekInput): WeekOutput {
  const staff = input.staff ?? NEUTRAL_STAFF;
  const t0 = input.training;
  const weekNo = (t0.weekNo ?? 0) + 1;
  const seed = `treino:${input.split}:${weekNo}`;
  const progress: TrainingState['progress'] = { ...(t0.progress ?? {}) };
  const condition: Record<string, PlayerCondition> = { ...input.condition };
  const report: TrainingWeekReport = { weekNo, split: input.split, injuries: [], recovered: [], leak: null, familiarity: [] };
  const fitDelta = weekFitnessDelta(t0);
  const sharpGain = weekSharpGain(t0);

  for (const p of input.players) {
    const c0 = condition[p.id] ?? defaultCondition();
    const maps = input.maps[p.id] ?? 0;
    if (isInjured(c0)) {
      const left = Math.round((c0.injury!.weeksLeft - Math.max(0.5, staff.injuryRecovery ?? 1)) * 10) / 10;
      const healed = left <= 0;
      if (healed) report.recovered.push({ playerId: p.id, nick: p.nick });
      condition[p.id] = {
        fitness: clampC(c0.fitness + INJURED_RECOVERY),
        sharpness: clampC(c0.sharpness * (1 - SHARP_DECAY)),
        injury: healed ? null : { kind: c0.injury!.kind, weeksLeft: left },
      };
      continue;
    }
    // treino: pontos por atributo acumulam no split
    const pts = playerWeekPoints(t0, t0.focus[p.id], staff);
    const prev = progress[p.id] ?? {};
    const next: Partial<Record<AttrKey, number>> = {};
    for (const k of ALL_ATTRS) next[k] = Math.round(((prev[k] ?? 0) + pts[k]) * 100) / 100;
    progress[p.id] = next;
    const fitness = clampC(c0.fitness + fitDelta);
    const sharpness = clampC(c0.sharpness + sharpGain + maps * SHARP_PER_MAP - c0.sharpness * SHARP_DECAY);
    // lesão / burnout
    let injury: PlayerCondition['injury'] = null;
    const pseed = `${seed}:${p.id}`;
    if (fitness <= BURNOUT_FITNESS && unit(`${pseed}:burnout`) < BURNOUT_CHANCE * (staff.injuryRisk ?? 1)) {
      injury = { kind: 'burnout', weeksLeft: 2 + Math.floor(unit(`${pseed}:bw`) * 2) };
    } else if (unit(`${pseed}:inj`) < weeklyInjuryRisk(t0, fitness, p.proneness, staff, maps)) {
      const pick = pickInjury(pseed, t0.week);
      injury = { kind: pick.kind, weeksLeft: pick.weeks };
    }
    if (injury) report.injuries.push({ playerId: p.id, nick: p.nick, kind: injury.kind, weeks: injury.weeksLeft });
    condition[p.id] = { fitness, sharpness, injury };
  }

  // familiaridade dos mapas priorizados
  let tactics = input.tactics;
  const famPts = weekFamiliarityPoints(t0, staff);
  if (famPts > 0) {
    for (const m of t0.mapFocus.slice(0, 3)) {
      tactics = gainFamiliarity(tactics, m, famPts);
      report.familiarity.push({ map: m, points: famPts });
    }
  }
  // VOD: estuda o adversário já escolhido no Plano de jogo (se houver)
  const target = tactics.antiStrat?.opponentTeamId;
  const vod = vodPrepPoints(t0);
  if (target && vod > 0) tactics = gainAntiStrat(tactics, target, vod);

  // vazamento: cada sessão de scrim da agenda pode entregar seus defaults
  let leaks = decayLeaks(t0.leaks);
  const targets = input.leakTargets ?? [];
  const scrims = t0.week.filter((x) => x === 'scrim').length;
  if (targets.length && scrims > 0) {
    for (let i = 0; i < scrims; i++) {
      if (unit(`${seed}:leak:${i}`) >= LEAK_CHANCE_SESSION) continue;
      const teamId = targets[hashStr(`${seed}:leakto:${i}`) % targets.length];
      const level = Math.min(1, Math.round(((leaks[teamId] ?? 0) + 0.5) * 100) / 100);
      leaks = { ...leaks, [teamId]: level };
      report.leak = { teamId, level };
    }
  }

  return {
    training: { ...t0, progress, weeks: (t0.weeks ?? 0) + 1, weekNo, leaks, lastWeek: report },
    condition,
    tactics,
    report,
  };
}

/** Scrim marcada contra um time real: ritmo, desgaste, familiaridade no mapa e vazamento. */
export function applyRealScrim(
  g: Pick<GestaoState, 'training' | 'condition' | 'tactics'>,
  starters: string[],
  opts: { oppId: string; map: MapId; oppInCircuit: boolean; seed: string; staff?: StaffEffects },
): { training: TrainingState; condition: Record<string, PlayerCondition>; tactics: TacticsState; leaked: boolean } {
  const condition = { ...g.condition };
  for (const id of starters) {
    const c = condition[id] ?? defaultCondition();
    if (isInjured(c)) continue;
    condition[id] = { ...c, fitness: clampC(c.fitness - 4), sharpness: clampC(c.sharpness + 6) };
  }
  const tactics = gainFamiliarity(g.tactics, opts.map, Math.round(3 * (opts.staff?.familiarityGain ?? 1) * 10) / 10);
  const leaked = opts.oppInCircuit && unit(`scrimreal:${opts.seed}`) < LEAK_CHANCE_REAL;
  const leaks = { ...(g.training.leaks ?? {}) };
  if (leaked) leaks[opts.oppId] = Math.min(1, Math.round(((leaks[opts.oppId] ?? 0) + 0.6) * 100) / 100);
  return { training: { ...g.training, leaks }, condition, tactics, leaked };
}

/** Virada de split: zera os pontos acumulados e a contagem de semanas; vazamentos esfriam. */
export function closeTrainingSplit(t: TrainingState): TrainingState {
  return { ...t, progress: {}, weeks: 0, leaks: {}, lastWeek: null };
}

/** Recuperação de fitness numa folga (entre etapas / fim de split / pré-temporada). */
export function recoverCondition(condition: Record<string, PlayerCondition>, amount: number, bonus = 0): Record<string, PlayerCondition> {
  const out: Record<string, PlayerCondition> = {};
  const total = amount + Math.max(0, bonus);
  for (const [id, c] of Object.entries(condition)) out[id] = { ...c, fitness: clampC(c.fitness + total) };
  return out;
}

// ─── Ponte com o sistema antigo de fadiga (0–100, 100 = exausto) ────────────
// A fadiga deixou de ser guardada: ela é a leitura de `100 − fitness`. As
// funções antigas (fadiga por série, bootcamp) continuam puras sobre o mapa
// de fadiga; a Carreira converte na borda.
export function conditionWithFatigue(condition: Record<string, PlayerCondition> | undefined, fatigue: Record<string, number>): Record<string, PlayerCondition> {
  const out: Record<string, PlayerCondition> = { ...(condition ?? {}) };
  for (const [id, f] of Object.entries(fatigue)) {
    const c = out[id] ?? defaultCondition();
    out[id] = { ...c, fitness: clampC(100 - f) };
  }
  return out;
}

// ─── Migração do foco antigo (5 atributos-núcleo) ──────────────────────────
// `trainingFocusAttr` (engine/career/training.ts, save ≤ v27) apontava um dos 5
// números legados; vira foco no atributo principal daquele grupo. O `mapFocus`
// antigo (até 3 mapas) vira os mapas priorizados.
export const LEGACY_FOCUS_ATTR: Record<string, AttrKey> = {
  aim: 'aim', awp: 'awp', igl: 'gameSense', clutch: 'clutch', consistency: 'consistency',
};

type LegacySave = { trainingFocusAttr?: unknown; mapFocus?: unknown; fatigue?: unknown };

export function trainingFromLegacy(raw: object | null | undefined): TrainingState {
  const save = raw as LegacySave | null | undefined;
  const t = defaultTrainingState();
  const fa = save?.trainingFocusAttr;
  if (fa && typeof fa === 'object' && !Array.isArray(fa)) {
    for (const [pid, core] of Object.entries(fa as Record<string, unknown>)) {
      const attr = typeof core === 'string' ? LEGACY_FOCUS_ATTR[core] : undefined;
      if (attr) t.focus[pid] = { kind: 'attr', attr };
    }
  }
  const mf = save?.mapFocus;
  const list = Array.isArray(mf) ? mf : typeof mf === 'string' ? [mf] : [];
  t.mapFocus = list.filter((m): m is MapId => (MAP_POOL as readonly string[]).includes(m as string)).slice(0, 3);
  return t;
}

export function legacyFatigueOf(raw: object | null | undefined, id: string): number | undefined {
  const f = (raw as LegacySave | null | undefined)?.fatigue;
  if (!f || typeof f !== 'object') return undefined;
  const v = (f as Record<string, unknown>)[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Saneia o bloco de treino vindo do save (campos opcionais ausentes ganham o padrão). */
export function normalizeTraining(raw: TrainingState | null | undefined): TrainingState {
  const d = defaultTrainingState();
  if (!raw || raw.v !== 1) return d;
  const week = Array.isArray(raw.week) && raw.week.length === 7 && raw.week.every((x) => (SESSIONS as string[]).includes(x)) ? raw.week : d.week;
  return {
    ...d,
    ...raw,
    week,
    intensity: raw.intensity in INTENSITY ? raw.intensity : 'normal',
    focus: raw.focus ?? {},
    mapFocus: Array.isArray(raw.mapFocus) ? raw.mapFocus.slice(0, 3) : [],
  };
}

// ─── Leitura do bloco `gestao` num save qualquer ────────────────────────────
type SaveWithGestao = LegacySave & { gestao?: GestaoState | null; squad?: { playerId: string }[] };

/** Bloco `gestao` do save, montado com os padrões (e o legado) se ainda não existir. */
export function gestaoOf(save: SaveWithGestao): GestaoState {
  const g = save.gestao;
  if (g && g.v === 1) {
    return {
      ...g,
      training: normalizeTraining(g.training),
      tactics: g.tactics ?? defaultTactics(),
      staff: g.staff ?? defaultStaff(),
      condition: g.condition ?? {},
    };
  }
  const condition: Record<string, PlayerCondition> = {};
  for (const s of save.squad ?? []) condition[s.playerId] = defaultCondition(legacyFatigueOf(save, s.playerId));
  return { v: 1, training: trainingFromLegacy(save), tactics: defaultTactics(), staff: defaultStaff(save as Parameters<typeof defaultStaff>[0]), condition };
}

export function conditionOf(save: SaveWithGestao, id: string): PlayerCondition {
  return gestaoOf(save).condition[id] ?? defaultCondition(legacyFatigueOf(save, id));
}

/** Fadiga (0–100) dos ids pedidos, lida da condição — a visão antiga para as telas e regras antigas. */
export function fatigueView(save: SaveWithGestao, ids: string[]): Record<string, number> {
  const g = gestaoOf(save);
  const out: Record<string, number> = {};
  for (const id of ids) {
    const c = g.condition[id];
    out[id] = c ? Math.max(0, Math.min(100, Math.round(100 - c.fitness))) : Math.round(legacyFatigueOf(save, id) ?? 0);
  }
  return out;
}

/** Semanas até voltar (arredondado pra cima) ou 0. */
export function injuryWeeks(c: PlayerCondition | null | undefined): number {
  return isInjured(c) ? Math.ceil(c!.injury!.weeksLeft) : 0;
}
