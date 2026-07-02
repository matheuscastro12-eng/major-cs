// Ponte RTP → engine de match.
//
// O engine (engine/match.ts) consome os 5 stats legados (aim/clutch/consistency/
// awp/igl, escala 0-100). No RTP os 28 atributos FM-style (1-20) são a verdade,
// então DERIVAMOS os 5 stats agregando os atributos relevantes. Assim treinar os
// 28 flui naturalmente pro desempenho na partida (RTP3) sem dupla contabilidade.

import type { AttrKey } from '../attributes';
import { computeOvrFromAttributes } from '../attributes';
import type { Role, Playstyle, TPlayer } from '../../types';
import { derivePlaystyle } from '../../types';
import type { ProPlayer } from './types';

// média de um conjunto de atributos (1-20) → escala 0-100
function avg100(attrs: Record<AttrKey, number>, keys: AttrKey[]): number {
  if (keys.length === 0) return 50;
  const sum = keys.reduce((a, k) => a + (attrs[k] ?? 10), 0);
  return Math.round((sum / keys.length) * 5); // *5 mapeia 1-20 → 5-100
}

export interface CoreStats {
  aim: number;
  clutch: number;
  consistency: number;
  awp: number;
  igl: number;
}

// Agrega os 28 → 5. Cada stat legado é a média dos atributos que mais o definem.
export function coreStatsFromAttrs(attrs: Record<AttrKey, number>): CoreStats {
  return {
    aim: avg100(attrs, ['aim', 'aimMovement', 'tap', 'spray', 'headshot', 'crosshair', 'preAim']),
    clutch: avg100(attrs, ['clutch', 'composure', 'anticipation', 'offAngles']),
    consistency: avg100(attrs, ['consistency', 'concentration', 'discipline', 'positioning']),
    awp: avg100(attrs, ['awp']),
    igl: avg100(attrs, ['leadership', 'communication', 'gameSense', 'decisions', 'vision']),
  };
}

// OVR oficial do protagonista (cache em ProPlayer.ovr). Usa o cálculo dos 28.
export function proOvr(attrs: Record<AttrKey, number>, role: Role): number {
  return computeOvrFromAttributes(attrs, role);
}

// Constrói o TPlayer runtime do protagonista pra dropar no simulateSeries (RTP3).
// `form` vem do ProPlayer; `playstyle` cai pro default da role se ausente.
export function proToTPlayer(p: ProPlayer, runtimeId = 'rtp-hero'): TPlayer {
  const core = coreStatsFromAttrs(p.attrs);
  const playstyle: Playstyle = p.playstyle ?? derivePlaystyle(p.role);
  const skill = core.aim * 0.6 + core.consistency * 0.25 + core.clutch * 0.15;
  return {
    id: runtimeId,
    sourcePlayerId: p.id,
    nick: p.nick,
    name: p.name,
    country: p.country,
    role: p.role,
    role2: p.role2,
    playstyle,
    aim: core.aim,
    clutch: core.clutch,
    consistency: core.consistency,
    awp: core.awp,
    igl: core.igl,
    skill,
    ovr: p.ovr,
    form: p.form,
  };
}
