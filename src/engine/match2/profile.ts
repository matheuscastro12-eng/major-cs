// PERFIL DE DUELO de um jogador — a leitura dos 28 atributos + ocultos que o
// motor v2 usa. Lê SÓ `attrsOf(p)` (contrato do realismo FM). Tudo na escala
// FM 1–20; o motor converte diferença de perfil em logit de duelo.
//
// Cada composto documenta QUAIS atributos pesam e ONDE (ver tabela no
// cabeçalho de engine.ts). Nenhum atributo visível é enfeite: se aparece na
// tela, pesa em algum duelo, troca, utilitária ou fase do round.

import type { Playstyle, Role, TPlayer } from '../../types';
import { attrsOf, type PlayerAttrs } from '../attrs/model';
import type { AttrKey } from '../attributes';
import { playstyleOf } from '../matchShared';

export interface DuelProfile {
  id: string;
  role: Role;
  role2?: Role;
  style: Playstyle;
  // poder de arma (duelo "no gatilho") por classe de arma
  rifle: number;      // AK/M4
  awp: number;        // AWP
  pistol: number;     // pistol round e eco (tap, headshot)
  smg: number;        // force (SMG/escopeta/pistola pesada)
  // habilidade de FASE do round
  entry: number;      // abrir o site: quem pica o ângulo no T
  hold: number;       // segurar o ângulo no CT (duelo de abertura)
  sense: number;      // meio de round: leitura, posição, decisão
  post: number;       // pós-plant do T: segurar o C4
  retake: number;     // retake do CT
  clutch: number;     // último vivo (1vX)
  // time
  trade: number;      // trocar a morte do companheiro (teamwork, comunicação, reação)
  util: number;       // utilitária/execução (coordenação, APM, comunicação, visão)
  igl: number;        // qualidade de chamada (liderança, comunicação, game sense…)
  hsRate: number;     // multiplicador de headshot (atributo headshot)
  // atributos crus usados por modificadores de contexto
  stamina: number;
  concentration: number;
  adaptability: number;
  consistency: number;
  temperament: number;      // oculto
  bigMatch: number;         // oculto
  consistencyHidden: number;// oculto
}

const mix = (a: Record<AttrKey, number>, w: Partial<Record<AttrKey, number>>): number => {
  let s = 0, t = 0;
  for (const k in w) {
    const wk = w[k as AttrKey]!;
    s += a[k as AttrKey] * wk;
    t += wk;
  }
  return s / t;
};

export function duelProfile(p: TPlayer, attrs: PlayerAttrs = attrsOf(p)): DuelProfile {
  const a = attrs.a;
  const h = attrs.h;
  return {
    id: p.id,
    role: p.role,
    role2: p.role2,
    style: playstyleOf(p),
    rifle: mix(a, { aim: 0.22, crosshair: 0.14, reflexes: 0.12, reaction: 0.1, headshot: 0.1, spray: 0.1, tap: 0.08, aimMovement: 0.07, preAim: 0.07 }),
    awp: mix(a, { awp: 0.45, crosshair: 0.15, reflexes: 0.15, reaction: 0.1, positioning: 0.15 }),
    pistol: mix(a, { tap: 0.3, headshot: 0.25, aim: 0.25, aimMovement: 0.2 }),
    smg: mix(a, { spray: 0.3, aimMovement: 0.25, aim: 0.25, reaction: 0.2 }),
    entry: mix(a, { aimMovement: 0.3, reaction: 0.25, preAim: 0.2, decisions: 0.15, reflexes: 0.1 }),
    hold: mix(a, { crosshair: 0.28, positioning: 0.25, anticipation: 0.25, offAngles: 0.22 }),
    sense: mix(a, { gameSense: 0.3, positioning: 0.25, decisions: 0.25, anticipation: 0.2 }),
    post: mix(a, { positioning: 0.35, composure: 0.25, discipline: 0.2, offAngles: 0.2 }),
    retake: mix(a, { decisions: 0.3, aimMovement: 0.25, reaction: 0.25, composure: 0.2 }),
    clutch: mix(a, { clutch: 0.35, composure: 0.25, concentration: 0.2, decisions: 0.2 }),
    trade: mix(a, { teamwork: 0.4, communication: 0.3, reaction: 0.3 }),
    util: mix(a, { coordination: 0.3, apm: 0.25, communication: 0.25, vision: 0.2 }),
    igl: mix(a, { leadership: 0.3, communication: 0.25, gameSense: 0.2, decisions: 0.15, vision: 0.1 }),
    hsRate: 0.75 + 0.5 * ((a.headshot - 10) / 10),
    stamina: a.stamina,
    concentration: a.concentration,
    adaptability: a.adaptability,
    consistency: a.consistency,
    temperament: h.temperament,
    bigMatch: h.bigMatch,
    consistencyHidden: h.consistencyHidden,
  };
}
