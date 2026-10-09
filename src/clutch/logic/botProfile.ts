// PlayerAttrs (1..20) → parâmetros de comportamento do bot. Puro.
import type { PlayerAttrs } from '../../engine/attrs/model';

export interface BotProfile {
  reactionMs: number;      // 420 → 160
  aimErrorDeg: number;     // 6 → 0.8
  headshotChance: number;  // 0.15 → 0.55
  sprayComp: number;       // 0.3 → 0.9
  burst: boolean;          // tap > spray: atira em rajadas curtas
  moveAimPenalty: number;  // multiplicador do erro atirando andando (2.0 → 1.2)
  preAimChance: number;    // 0.2 → 0.9
  offAngleWeight: number;  // 0..1
  retreatHp: number;       // 30 → 70 (quem lê melhor o jogo recua mais cedo)
  pressureDegrade: number; // 0.40 → 0.05
  aggression: number;      // 0..1
  teamwork: number;        // 0..1
  variance: number;        // σ por engajamento
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const norm = (v: number) => clamp((v - 1) / 19, 0, 1);

export function botProfileFrom(p: PlayerAttrs, difficulty = 1): BotProfile {
  const a = p.a;
  const avg = (...v: number[]) => v.reduce((s, x) => s + norm(x), 0) / v.length;
  const d = clamp(difficulty, 0.8, 1.2);
  return {
    reactionMs: (420 - 260 * avg(a.reaction, a.reflexes)) / d,
    aimErrorDeg: (6 - 5.2 * avg(a.aim, a.crosshair)) / d,
    headshotChance: clamp((0.15 + 0.4 * norm(a.headshot)) * d, 0, 0.7),
    sprayComp: 0.3 + 0.6 * avg(a.spray, a.tap),
    burst: a.tap > a.spray,
    moveAimPenalty: 2.0 - 0.8 * norm(a.aimMovement),
    preAimChance: 0.2 + 0.7 * avg(a.preAim, a.anticipation),
    offAngleWeight: avg(a.positioning, a.offAngles),
    retreatHp: 30 + 40 * avg(a.decisions, a.gameSense),
    pressureDegrade: 0.4 - 0.35 * avg(a.composure, p.h.bigMatch ?? 10),
    aggression: avg(a.clutch, a.adaptability),
    teamwork: norm(a.teamwork),
    variance: 0.35 - 0.3 * norm(p.h.consistencyHidden ?? 10),
  };
}
