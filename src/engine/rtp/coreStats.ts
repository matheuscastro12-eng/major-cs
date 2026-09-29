// Ponte RTP → engine de match.
//
// O engine (engine/match.ts) consome os 5 stats legados (aim/clutch/consistency/
// awp/igl, escala 0-100). No RTP os 28 atributos FM-style (1-20) são a verdade,
// então DERIVAMOS os 5 stats agregando os atributos relevantes. Assim treinar os
// 28 flui naturalmente pro desempenho na partida (RTP3) sem dupla contabilidade.

import type { AttrKey } from '../attributes';
import { computeOvrFromAttributes } from '../attributes';
import {
  caFromAttrs, deriveHiddenAttrs, legacyFromA, ovrFromLegacy, HIDDEN_KEYS,
  type HiddenKey, type PlayerAttrs,
} from '../attrs/model';
import type { PlayerPersonality } from '../career/personality';
import type { Role, Playstyle, TPlayer } from '../../types';
import { derivePlaystyle } from '../../types';
import type { ProPlayer } from './types';

export interface CoreStats {
  aim: number;
  clutch: number;
  consistency: number;
  awp: number;
  igl: number;
}

// Agrega os 28 → 5 pela ponte do contrato (engine/attrs/model.ts): os MESMOS
// grupos que o RtP sempre usou (mira, AWP, IGL, clutch, consistência), agora com
// pesos inteiros que permitem a volta exata — RtP, Carreira e Ultimate leem os
// 5 números do mesmo jeito.
export function coreStatsFromAttrs(attrs: Record<AttrKey, number>): CoreStats {
  return legacyFromA(attrs);
}

// Ocultos do protagonista: plausíveis pelos atributos e ajustados pela
// personalidade escolhida (o cabeça-quente tem temperamento curto, o mercenário
// pouca lealdade...). Determinístico pelo id.
const PERSONALITY_HIDDEN: Record<PlayerPersonality, Partial<Record<HiddenKey, number>>> = {
  leader: { bigMatch: 1, professionalism: 2, loyalty: 1 },
  mercenary: { ambition: 3, loyalty: -4 },
  prodigy: { ambition: 2, professionalism: 1, versatility: 1 },
  hothead: { temperament: -4, bigMatch: 1 },
  resilient: { temperament: 3, consistencyHidden: 1 },
};
export function heroHidden(p: Pick<ProPlayer, 'id' | 'role' | 'role2' | 'attrs' | 'age' | 'personality'>): Record<HiddenKey, number> {
  const core = legacyFromA(p.attrs);
  const h = deriveHiddenAttrs({ id: p.id, role: p.role, role2: p.role2, ...core }, p.attrs, p.age, ovrFromLegacy(core));
  const tilt = PERSONALITY_HIDDEN[p.personality] ?? {};
  for (const k of HIDDEN_KEYS) h[k] = Math.max(1, Math.min(20, h[k] + (tilt[k] ?? 0)));
  return h;
}

// [realismo FM] Os atributos do protagonista no formato do contrato: os 28
// treinados, os ocultos gravados no save, CA pelos atributos e PA pelo teto por
// atributo (`potential`).
export function proAttrs(p: Pick<ProPlayer, 'id' | 'role' | 'role2' | 'attrs' | 'potential' | 'age' | 'personality'> & { hidden?: Record<HiddenKey, number> }): PlayerAttrs {
  const ca = caFromAttrs(p.attrs, p.role);
  const pa = Math.max(ca, caFromAttrs(p.potential ?? p.attrs, p.role));
  return { v: 1, a: p.attrs, h: p.hidden ?? heroHidden(p), ca, pa };
}

// OVR oficial do protagonista (cache em ProPlayer.ovr). Usa o cálculo dos 28.
export function proOvr(attrs: Record<AttrKey, number>, role: Role): number {
  return computeOvrFromAttributes(attrs, role);
}

// Constrói o TPlayer runtime do protagonista pra dropar no simulateSeries (RTP3).
// `form` vem do ProPlayer; `playstyle` cai pro default da role se ausente.
export function proToTPlayer(p: ProPlayer, runtimeId = 'rtp-hero'): TPlayer {
  // [realismo FM] o motor recebe os atributos do protagonista (fonte da verdade)
  // e os 5 números saem deles pela ponte do contrato.
  const attrs = proAttrs(p);
  const core = coreStatsFromAttrs(attrs.a);
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
    attrs,
  };
}
