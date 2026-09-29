// Ponte RTP → engine de match.
//
// O engine (engine/match.ts) consome os 5 stats legados (aim/clutch/consistency/
// awp/igl, escala 0-100). No RTP os 28 atributos FM-style (1-20) são a verdade,
// então DERIVAMOS os 5 stats agregando os atributos relevantes. Assim treinar os
// 28 flui naturalmente pro desempenho na partida (RTP3) sem dupla contabilidade.

import type { AttrKey } from '../attributes';
import { computeOvrFromAttributes } from '../attributes';
import {
  caFromAttrs, caFromOvr, deriveHiddenAttrs, fitAttrsToLegacy, legacyFromA, ovrFromLegacy, HIDDEN_KEYS,
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

// [realismo FM] Atributos do herói NA ESCALA DO MUNDO, para o motor por duelos.
// Os 28 do RtP são treinados numa escala própria: o OVR exibido (cálculo dos 28,
// `proOvr`) fica ~20 pontos acima do OVR legado dos mesmos atributos. Aqui o
// perfil inteiro é deslocado para que o OVR legado bata com o OVR exibido — um
// herói de OVR X fica com atributos na faixa de um colega de OVR X — mantendo
// as ênfases (o que ele treinou mais continua acima), os ocultos e o espaço até
// o teto (PA desloca junto).
export function heroEngineAttrs(
  p: Pick<ProPlayer, 'id' | 'role' | 'role2' | 'attrs' | 'potential' | 'age' | 'personality'> & { hidden?: Record<HiddenKey, number>; ovr?: number },
): PlayerAttrs {
  const x = proAttrs(p);
  const raw = legacyFromA(x.a);
  const shown = p.ovr ?? proOvr(p.attrs, p.role);
  const k = shown - ovrFromLegacy(raw); // os pesos do OVR somam 1: +k em todos os números = +k no OVR
  const up = (v: number) => Math.max(5, Math.min(99, v + k));
  const flavor = Object.fromEntries(Object.entries(x.a).map(([key, v]) => [key, v + k / 5])) as Record<AttrKey, number>;
  const a = fitAttrsToLegacy(flavor, { aim: up(raw.aim), awp: up(raw.awp), igl: up(raw.igl), clutch: up(raw.clutch), consistency: up(raw.consistency) });
  const ca = caFromOvr(ovrFromLegacy(legacyFromA(a)));
  return { v: 1, a, h: x.h, ca, pa: Math.min(200, Math.max(ca, x.pa + (ca - x.ca))) };
}

// OVR oficial do protagonista (cache em ProPlayer.ovr). Usa o cálculo dos 28.
export function proOvr(attrs: Record<AttrKey, number>, role: Role): number {
  return computeOvrFromAttributes(attrs, role);
}

// Constrói o TPlayer runtime do protagonista pra dropar no simulateSeries (RTP3).
// `form` vem do ProPlayer; `playstyle` cai pro default da role se ausente.
export function proToTPlayer(p: ProPlayer, runtimeId = 'rtp-hero'): TPlayer {
  // [realismo FM] os 5 números saem dos 28 atributos pela ponte do contrato. O
  // TPlayer NÃO leva `attrs`: os 28 do herói estão numa escala abaixo da do mundo
  // (OVR dos 28 × OVR legado), e o buildUserTeam do RtP alinha mira/consistência
  // ao OVR dele. Para o motor v2 ler o perfil real do herói na escala certa, use
  // `heroEngineAttrs` (herói de OVR X com atributos na faixa de um colega de OVR X).
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
