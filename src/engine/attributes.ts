// 28 atributos FM-style — T3.1 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Cada jogador tem 28 atributos individuais agrupados em 3 categorias:
//   - Mechanical (9): habilidade pura com o mouse
//   - Mental (12): leitura, decisão, posicionamento, comunicação
//   - Physical (7): condicionamento, disciplina, coordenação
//
// **Sem mudança de schema do save**: os atributos são DERIVADOS via hash
// determinístico a partir do playerId + 5 stats existentes (aim, clutch,
// consistency, awp, igl). Isso permite enriquecimento da UI sem migration
// nem perda de continuidade — o mesmo player sempre tem os mesmos 28
// atributos enquanto seu id e stats base não mudarem.
//
// Integração com engine de match: ADIADO. Por enquanto os 28 atributos são
// visuais (player profile mostra a árvore). Em PR separado, `engine/match.ts`
// pode usar atributos específicos pra calcular kills mais granularmente.

import { hashStr } from '../state/hash';
import type { Role } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export type AttrKey =
  // Mechanical (9)
  | 'aim' | 'aimMovement' | 'tap' | 'spray' | 'awp' | 'headshot' | 'crosshair' | 'preAim' | 'offAngles'
  // Mental (12)
  | 'gameSense' | 'decisions' | 'anticipation' | 'composure' | 'concentration' | 'positioning'
  | 'clutch' | 'teamwork' | 'communication' | 'leadership' | 'adaptability' | 'vision'
  // Physical / Professional (7)
  | 'reflexes' | 'reaction' | 'stamina' | 'discipline' | 'coordination' | 'apm' | 'consistency';

export const MECHANICAL_KEYS: AttrKey[] = [
  'aim', 'aimMovement', 'tap', 'spray', 'awp', 'headshot', 'crosshair', 'preAim', 'offAngles',
];
export const MENTAL_KEYS: AttrKey[] = [
  'gameSense', 'decisions', 'anticipation', 'composure', 'concentration', 'positioning',
  'clutch', 'teamwork', 'communication', 'leadership', 'adaptability', 'vision',
];
export const PHYSICAL_KEYS: AttrKey[] = [
  'reflexes', 'reaction', 'stamina', 'discipline', 'coordination', 'apm', 'consistency',
];

export const ALL_ATTRS: AttrKey[] = [...MECHANICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS];

// ─────────────────────────────────────────────────────────────────────────────
// Player input (subset do TPlayer/Player legacy)

export interface PlayerForAttrs {
  id: string;
  aim: number;        // 0-100
  clutch: number;     // 0-100
  consistency: number; // 0-100
  awp: number;        // 0-100
  igl: number;        // 0-100
  role: Role;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivação
//
// Cada atributo é derivado de:
//   1. Um "base" do stat legacy mais relacionado (ex.: `aim` deriva de `aim`,
//      `gameSense` deriva de `clutch+igl`, `awp` deriva de `awp`)
//   2. Um ruído determinístico via hash(playerId + attrKey) — ±15%
//
// Resultado: 1-20 (escala FM). Player com aim 80 → atributo `aim` ~16 ±2.

const FM_MAX = 20;

/** Mapa de "base score" por atributo (0-100 → escala 1-20).
 *  Cada função recebe os 5 stats legados e devolve um número 0-100. */
const BASE_SCORE: Record<AttrKey, (p: PlayerForAttrs) => number> = {
  // Mechanical
  aim:         (p) => p.aim,
  aimMovement: (p) => p.aim * 0.85 + p.consistency * 0.15,
  tap:         (p) => p.aim * 0.7 + p.consistency * 0.3,
  spray:       (p) => p.aim * 0.6 + p.consistency * 0.4,
  awp:         (p) => p.awp,
  headshot:    (p) => p.aim * 0.8 + p.consistency * 0.2,
  crosshair:   (p) => p.aim * 0.5 + p.consistency * 0.5,
  preAim:      (p) => p.aim * 0.45 + p.igl * 0.3 + p.consistency * 0.25,
  offAngles:   (p) => p.aim * 0.4 + p.clutch * 0.3 + p.consistency * 0.3,

  // Mental
  gameSense:    (p) => p.igl * 0.5 + p.clutch * 0.5,
  decisions:    (p) => p.igl * 0.6 + p.clutch * 0.4,
  anticipation: (p) => p.igl * 0.5 + p.consistency * 0.5,
  composure:    (p) => p.clutch * 0.7 + p.consistency * 0.3,
  concentration: (p) => p.consistency * 0.7 + p.clutch * 0.3,
  positioning:  (p) => p.igl * 0.4 + p.consistency * 0.4 + p.clutch * 0.2,
  clutch:       (p) => p.clutch,
  teamwork:     (p) => p.igl * 0.6 + p.consistency * 0.4,
  communication: (p) => p.igl,
  leadership:   (p) => p.igl * 0.8 + p.clutch * 0.2,
  adaptability: (p) => p.clutch * 0.5 + p.igl * 0.3 + p.consistency * 0.2,
  vision:       (p) => p.igl * 0.7 + p.aim * 0.3,

  // Physical
  reflexes:    (p) => p.aim * 0.7 + p.consistency * 0.3,
  reaction:    (p) => p.aim * 0.6 + p.clutch * 0.4,
  stamina:     (p) => p.consistency * 0.8 + p.clutch * 0.2,
  discipline:  (p) => p.consistency * 0.7 + p.igl * 0.3,
  coordination: (p) => p.aim * 0.5 + p.consistency * 0.5,
  apm:         (p) => p.aim * 0.6 + p.consistency * 0.4,
  consistency: (p) => p.consistency,
};

/** Converte 0-100 → 1-20 com noise ±15% determinístico por (id, attr). */
function toFm(base: number, playerId: string, attr: AttrKey): number {
  const seed = hashStr(`attr:${playerId}:${attr}`);
  const noisePct = ((seed % 31) - 15) / 100; // -0.15 .. +0.15
  const noisy = base * (1 + noisePct);
  const fm = Math.round((noisy / 100) * FM_MAX);
  return Math.max(1, Math.min(FM_MAX, fm));
}

/** Devolve os 28 atributos do player. Determinístico (mesmo id+stats → mesmo output). */
export function playerAttributes(p: PlayerForAttrs): Record<AttrKey, number> {
  const out = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) {
    out[k] = toFm(BASE_SCORE[k](p), p.id, k);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// OVR a partir dos 28 (opcional — engine de match continua usando o legacy)

/** Peso de cada atributo no OVR final, ponderado por role. */
const OVR_WEIGHTS_BY_ROLE: Record<Role, Partial<Record<AttrKey, number>>> = {
  Entry: {
    aim: 2.0, aimMovement: 1.8, reflexes: 1.6, reaction: 1.5, offAngles: 1.4,
    composure: 1.0, decisions: 1.0, positioning: 1.0,
  },
  AWP: {
    awp: 2.5, crosshair: 1.6, preAim: 1.6, positioning: 1.4, anticipation: 1.2, composure: 1.2,
    aim: 0.6,
  },
  Rifler: {
    aim: 1.8, spray: 1.5, tap: 1.4, consistency: 1.4, positioning: 1.2, gameSense: 1.0,
  },
  Support: {
    teamwork: 1.6, communication: 1.4, discipline: 1.3, positioning: 1.3, gameSense: 1.2, consistency: 1.2,
  },
  Lurker: {
    anticipation: 1.6, gameSense: 1.5, decisions: 1.4, composure: 1.4, offAngles: 1.3, clutch: 1.3,
  },
  IGL: {
    leadership: 2.0, communication: 1.8, gameSense: 1.7, decisions: 1.6, vision: 1.5, adaptability: 1.3,
  },
};

/** Calcula OVR composto (50-99) a partir dos 28 atributos + role. */
export function computeOvrFromAttributes(attrs: Record<AttrKey, number>, role: Role): number {
  const weights = OVR_WEIGHTS_BY_ROLE[role] ?? {};
  // Soma ponderada + base uniforme (todos os atributos contribuem)
  let weightedSum = 0;
  let totalWeight = 0;
  for (const k of ALL_ATTRS) {
    const w = weights[k] ?? 0.4; // baseline
    weightedSum += attrs[k] * w;
    totalWeight += w;
  }
  const avgAttr = weightedSum / totalWeight; // 1-20
  return Math.round(40 + (avgAttr / FM_MAX) * 55); // map 1-20 → 40-95
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers

export const ATTR_LABEL: Record<AttrKey, string> = {
  aim: 'Mira',
  aimMovement: 'Mira em movimento',
  tap: 'Tap shot',
  spray: 'Spray control',
  awp: 'AWP',
  headshot: 'Headshot %',
  crosshair: 'Crosshair placement',
  preAim: 'Pre-aim',
  offAngles: 'Off-angles',
  gameSense: 'Game sense',
  decisions: 'Decisões',
  anticipation: 'Antecipação',
  composure: 'Frieza',
  concentration: 'Concentração',
  positioning: 'Posicionamento',
  clutch: 'Clutch',
  teamwork: 'Trabalho em equipe',
  communication: 'Comunicação',
  leadership: 'Liderança',
  adaptability: 'Adaptabilidade',
  vision: 'Visão tática',
  reflexes: 'Reflexos',
  reaction: 'Reação',
  stamina: 'Stamina',
  discipline: 'Disciplina',
  coordination: 'Coordenação',
  apm: 'APM',
  consistency: 'Consistência',
};

/** Cor pra valor 1-20 (vermelho → amarelo → verde) */
export function attrColor(value: number): string {
  if (value >= 16) return '#5ed88a';
  if (value >= 13) return '#a3d860';
  if (value >= 10) return '#d8c060';
  if (value >= 7) return '#d89060';
  return '#e58a8a';
}
