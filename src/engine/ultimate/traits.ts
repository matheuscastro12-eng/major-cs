// Ultimate Squad — PROFUNDIDADE DE DUELO (iter33): traits passivas derivadas da
// carta + estilos de química consumíveis (comprados na Loja, aplicados a UMA
// cópia possuída). Tudo PURO/determinístico — nada de Math.random aqui.
//
// NÚMEROS (documentados — fairness do PvP):
//   • trait: +0.5 "OVR-equivalente" cada, máx 2 por carta → +1.0
//   • estilo: +0.5 / +1.0 / +1.5 OVR-eq conforme o encaixe (stat visado <75 / 75-84 / ≥85)
//   • cap por carta: +2.5 OVR-eq (estilo 1.5 + 2 traits 1.0)
//   • squad inteiro: máx 5 × 2.5 = 12.5 OVR-eq → multiplicador de força
//     1 + total × 0.0024, TETO 1.03 (+3%) — menor que a faixa da química
//     (0.90–1.10) de propósito: é tempero, não vira o jogo. Ambos os lados do
//     PvP têm acesso igual (traits são grátis; estilo custa 2500 credits).

import type { CardStats, UltCard } from './cards';

// ── TRAITS (passivas, derivadas — sem economia nova) ────────────────────────
export type TraitId = 'clutcher' | 'opener' | 'lurker' | 'igl-mind' | 'awp-star' | 'consistent';

export interface TraitDef { id: TraitId; name: string; desc: string; icon: string }

export const TRAITS: TraitDef[] = [
  { id: 'awp-star', name: 'AWP Estrela', desc: 'AWPer de elite: tiro pesado no duelo.', icon: '🎯' },
  { id: 'igl-mind', name: 'Mente de IGL', desc: 'Leitura de jogo acima da média.', icon: '🧠' },
  { id: 'opener', name: 'Abridor', desc: 'Entry que abre o bombsite na frente.', icon: '⚡' },
  { id: 'lurker', name: 'Fantasma', desc: 'Lurker frio que pune rotações.', icon: '👻' },
  { id: 'clutcher', name: 'Clutcher', desc: 'Sangue-frio nos rounds decisivos.', icon: '🧊' },
  { id: 'consistent', name: 'Constante', desc: 'Mira estável, jogo após jogo.', icon: '📈' },
];

const TRAIT_BY_ID = new Map(TRAITS.map((t) => [t.id, t] as const));
export function traitById(id: TraitId): TraitDef {
  return TRAIT_BY_ID.get(id)!;
}

export const TRAIT_BONUS = 0.5;   // OVR-eq por trait
export const MAX_TRAITS = 2;      // teto de traits por carta

// deriva 0-2 traits DETERMINÍSTICAS da carta (stats + função). Ordem de
// prioridade fixa: especialidade de função primeiro, depois as universais.
// Thresholds calibrados no catálogo real (sanity iter33, 533 cartas): 52% com
// 0 traits, 36% com 1, 12% com 2 — trait é distinção, não default. Cada trait
// aparece em 26-84 cartas (nenhuma é universal nem vazia).
export function traitsFor(card: Pick<UltCard, 'role' | 'stats'>): TraitId[] {
  const s: CardStats = card.stats;
  const out: TraitId[] = [];
  const push = (id: TraitId) => { if (out.length < MAX_TRAITS) out.push(id); };
  if (card.role === 'AWP' && s.tiro >= 84) push('awp-star');
  if (card.role === 'IGL' && s.visao >= 79) push('igl-mind');
  if (card.role === 'Entry' && s.reflexo >= 80) push('opener');
  if (card.role === 'Lurker' && s.clutch >= 74) push('lurker');
  if (s.clutch >= 83) push('clutcher');
  if (s.mira >= 84) push('consistent');
  return out;
}

// ── ESTILOS DE QUÍMICA (consumíveis — economia via funil normal) ────────────
export type StyleId = 'fragger' | 'ancora' | 'cacador' | 'cerebro' | 'mira';

export interface StyleDef {
  id: StyleId;
  name: string;
  desc: string;
  icon: string;
  stat: keyof CardStats; // stat visado — define o encaixe (e o bônus) na carta
}

export const STYLE_COST = 2500; // credits — comprado na Loja, aplica em 1 carta

export const STYLES: StyleDef[] = [
  { id: 'fragger', name: 'Fragger', desc: 'Perfil agressivo de abates — potencializa TIR.', icon: '🔥', stat: 'tiro' },
  { id: 'ancora', name: 'Âncora', desc: 'Segura o bomb com utilitário — potencializa UTI.', icon: '⚓', stat: 'util' },
  { id: 'cacador', name: 'Caçador', desc: 'Entrada explosiva — potencializa REF.', icon: '🏹', stat: 'reflexo' },
  { id: 'cerebro', name: 'Cérebro', desc: 'Mid-round e leitura — potencializa VIS.', icon: '🧠', stat: 'visao' },
  { id: 'mira', name: 'Mira', desc: 'Precisão cirúrgica — potencializa MIR.', icon: '🎯', stat: 'mira' },
];

const STYLE_BY_ID = new Map(STYLES.map((s) => [s.id, s] as const));
export function styleById(id: string | undefined): StyleDef | undefined {
  return id ? STYLE_BY_ID.get(id as StyleId) : undefined;
}
export function isStyleId(id: unknown): id is StyleId {
  return typeof id === 'string' && STYLE_BY_ID.has(id as StyleId);
}

// bônus OVR-eq do estilo NA carta: escala com o encaixe do stat visado.
// stat ≥85 → +1.5 · 75-84 → +1.0 · <75 → +0.5 (estilo em carta errada rende pouco).
export function styleBonusFor(card: Pick<UltCard, 'stats'>, styleId: string | undefined): number {
  const def = styleById(styleId);
  if (!def) return 0;
  const v = card.stats[def.stat];
  return v >= 85 ? 1.5 : v >= 75 ? 1.0 : 0.5;
}

// ── IMPACTO NO DUELO ─────────────────────────────────────────────────────────
export const CARD_DUEL_CAP = 2.5;              // OVR-eq máx por carta (estilo+traits)
export const SQUAD_DUEL_CAP = CARD_DUEL_CAP * 5; // 12.5 OVR-eq máx no squad
export const DUEL_EQ_MULT = 0.0024;            // força por OVR-eq → teto 1 + 12.5×0.0024 = 1.03

export interface CardDuelBonus { styleAdd: number; traits: TraitId[]; traitAdd: number; total: number }

// bônus de UMA carta: estilo (0..1.5) + traits (0.5 cada, máx 2) — cap 2.5.
export function cardDuelBonus(card: Pick<UltCard, 'role' | 'stats'>, styleId: string | undefined): CardDuelBonus {
  const traits = traitsFor(card);
  const styleAdd = styleBonusFor(card, styleId);
  const traitAdd = traits.length * TRAIT_BONUS;
  return { styleAdd, traits, traitAdd, total: Math.min(CARD_DUEL_CAP, styleAdd + traitAdd) };
}

export interface SquadDuelBonus { total: number; multiplier: number }

// soma do squad → multiplicador de força do duelo (aplicado JUNTO da química:
// no vs IA direto na strength; no PvP embutido no campo `chem` do snapshot,
// que os DOIS clientes aplicam igual — determinístico entre versões).
export function squadDuelBonus(cards: { card: Pick<UltCard, 'role' | 'stats'>; styleId?: string }[]): SquadDuelBonus {
  let total = 0;
  for (const c of cards) total += cardDuelBonus(c.card, c.styleId).total;
  total = Math.min(SQUAD_DUEL_CAP, total);
  return { total, multiplier: 1 + total * DUEL_EQ_MULT };
}
