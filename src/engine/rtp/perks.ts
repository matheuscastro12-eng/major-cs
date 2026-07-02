// RTP v8 — IDENTIDADE & PERKS: a camada RPG de progressão do protagonista.
//
// Três eixos que constroem a identidade do jogador ao longo da carreira:
//   1. NÍVEL/XP  — sobe jogando (rating, vitória, MVP). Cada nível dá 1 ponto de perk.
//   2. PERKS     — gastáveis numa ÁRVORE por função (Entry/AWP/Rifler/Support/
//                  Lurker/IGL) + uma trilha UNIVERSAL. Passivos honestos que entram
//                  no jogo de verdade (atributo efetivo, resistência a tilt, XP de
//                  treino, fama) — nada de número escondido.
//   3. TRAITS    — emergentes: você NÃO escolhe, eles se revelam pelo seu estilo
//                  (abridor nato, clutch merchant, mata-gigante…). Pequenos bônus
//                  + sabor. Detectados por contadores vitalícios (progression.tally).
//
// Puro e determinístico. Sem React, sem import de matchSim (evita ciclo — o
// contexto da partida chega via MatchProgressCtx montado pelo matchSim).

import type { Role } from '../../types';
import type { AttrKey } from '../attributes';
import type { RtpIconName } from './icons';
import type { RoadToProSave, PlayerProgression, ProgressTally } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
// Efeito de um perk/trait. Todos os campos são opcionais e se AGREGAM (soma pra
// attr/tiltResist/fatores; PRODUTO pra multiplicadores). matchFactor é SÓ display
// honesto no Round Room — perks que mexem em `attr` já aparecem no % base (não
// duplicam), então um perk usa `attr` OU `matchFactor`, nunca os dois no mesmo eixo.
export interface PerkEffect {
  attr?: Partial<Record<AttrKey, number>>;   // +N flat no atributo efetivo (entra no roll real)
  matchFactor?: { label: string; delta: number }; // fator visível nas odds (perks sem attr)
  tiltResist?: number;                        // 0..1 — amortece tombo de moral pós-derrota
  trainingXpMult?: number;                    // ex.: 1.12 = +12% XP de treino
  fameMult?: number;                          // ex.: 1.3 = fama pós-partida rende +30%
}

// ─────────────────────────────────────────────────────────────────────────────
// PERKS — árvore por função + trilha universal

export type PerkTree = Role | 'universal';

export interface PerkDef {
  id: string;
  tree: PerkTree;
  tier: 1 | 2 | 3;
  reqLevel: number;
  reqPerk?: string;            // pré-requisito (perk anterior na mesma trilha)
  label: string;
  desc: string;
  icon: RtpIconName;
  effect: PerkEffect;
}

export const PERKS: PerkDef[] = [
  // ── Universal (qualquer função) ───────────────────────────────────────────
  { id: 'u_grind', tree: 'universal', tier: 1, reqLevel: 1, label: 'Rato de treino', icon: 'gym',
    desc: '+12% de XP em todo treino. Você aproveita cada hora de servidor.', effect: { trainingXpMult: 1.12 } },
  { id: 'u_habits', tree: 'universal', tier: 2, reqLevel: 5, reqPerk: 'u_grind', label: 'Hábitos de pro', icon: 'balance',
    desc: 'Rotina profissional: aguenta melhor a pressão e mantém a disciplina.', effect: { tiltResist: 0.15, attr: { discipline: 1, stamina: 1 } } },
  { id: 'u_icon', tree: 'universal', tier: 3, reqLevel: 12, reqPerk: 'u_habits', label: 'Ídolo da torcida', icon: 'fame',
    desc: 'Sua fama rende 50% mais e você comanda o vestiário.', effect: { fameMult: 1.5, attr: { leadership: 1 } } },

  // ── Entry ───────────────────────────────────────────────────────────────
  { id: 'e_first', tree: 'Entry', tier: 1, reqLevel: 1, label: 'Primeira bala', icon: 'spark',
    desc: 'Você abre o round melhor que ninguém.', effect: { attr: { aim: 1, aimMovement: 1 }, matchFactor: { label: 'Abertura', delta: 5 } } },
  { id: 'e_aggr', tree: 'Entry', tier: 2, reqLevel: 5, reqPerk: 'e_first', label: 'Agressão calibrada', icon: 'fire',
    desc: 'Entra rápido sem perder o controle da mira.', effect: { attr: { reflexes: 1, reaction: 1 } } },
  { id: 'e_spear', tree: 'Entry', tier: 3, reqLevel: 12, reqPerk: 'e_aggr', label: 'Ponta de lança', icon: 'crosshair',
    desc: 'Sua entrada define o round — o time joga atrás de você.', effect: { attr: { aim: 1 }, matchFactor: { label: 'Ponta de lança', delta: 8 } } },

  // ── AWP ─────────────────────────────────────────────────────────────────
  { id: 'a_onetap', tree: 'AWP', tier: 1, reqLevel: 1, label: 'Um tiro, um abate', icon: 'crosshair',
    desc: 'AWP na mão é dinheiro no banco.', effect: { attr: { awp: 2 }, matchFactor: { label: 'AWP letal', delta: 6 } } },
  { id: 'a_hold', tree: 'AWP', tier: 2, reqLevel: 5, reqPerk: 'a_onetap', label: 'Segurar ângulo', icon: 'snow',
    desc: 'Paciência de sniper: segura o ângulo e pune o peek.', effect: { attr: { preAim: 1, positioning: 1 } } },
  { id: 'a_flick', tree: 'AWP', tier: 3, reqLevel: 12, reqPerk: 'a_hold', label: 'Flick impossível', icon: 'spark',
    desc: 'Reflexo de AWP de elite — o no-scope vira opção.', effect: { attr: { crosshair: 1, reflexes: 1 }, matchFactor: { label: 'Flick', delta: 7 } } },

  // ── Rifler ────────────────────────────────────────────────────────────────
  { id: 'r_spray', tree: 'Rifler', tier: 1, reqLevel: 1, label: 'Controle de spray', icon: 'crosshair',
    desc: 'Domina o recuo — segura o feixe no alvo.', effect: { attr: { spray: 2, tap: 1 } } },
  { id: 'r_metro', tree: 'Rifler', tier: 2, reqLevel: 5, reqPerk: 'r_spray', label: 'Metrônomo', icon: 'balance',
    desc: 'Rendimento constante rodada após rodada.', effect: { attr: { consistency: 1 }, matchFactor: { label: 'Consistência', delta: 5 } } },
  { id: 'r_deadeye', tree: 'Rifler', tier: 3, reqLevel: 12, reqPerk: 'r_metro', label: 'Olho de águia', icon: 'spark',
    desc: 'Mira cirúrgica: a cabeça é sempre o alvo.', effect: { attr: { aim: 1, headshot: 2 } } },

  // ── Support ─────────────────────────────────────────────────────────────
  { id: 's_util', tree: 'Support', tier: 1, reqLevel: 1, label: 'Mestre do utilitário', icon: 'bomb',
    desc: 'Suas granadas montam o round pro time.', effect: { attr: { teamwork: 1 }, matchFactor: { label: 'Utilitário', delta: 5 } } },
  { id: 's_glue', tree: 'Support', tier: 2, reqLevel: 5, reqPerk: 's_util', label: 'Cola do time', icon: 'team',
    desc: 'Mantém a comunicação limpa e a disciplina em pé.', effect: { attr: { communication: 1, discipline: 1 } } },
  { id: 's_self', tree: 'Support', tier: 3, reqLevel: 12, reqPerk: 's_glue', label: 'Altruísta', icon: 'balance',
    desc: 'Se sacrifica pela troca sem abalar a cabeça.', effect: { attr: { positioning: 1 }, tiltResist: 0.12 } },

  // ── Lurker ──────────────────────────────────────────────────────────────
  { id: 'l_flank', tree: 'Lurker', tier: 1, reqLevel: 1, label: 'Sombra', icon: 'skull',
    desc: 'Aparece onde ninguém espera.', effect: { attr: { offAngles: 1, anticipation: 1 } } },
  { id: 'l_time', tree: 'Lurker', tier: 2, reqLevel: 5, reqPerk: 'l_flank', label: 'Timing de lurk', icon: 'brain',
    desc: 'Lê o mapa e chega na hora exata.', effect: { attr: { gameSense: 1 }, matchFactor: { label: 'Timing de lurk', delta: 6 } } },
  { id: 'l_dna', tree: 'Lurker', tier: 3, reqLevel: 12, reqPerk: 'l_time', label: 'DNA de clutch', icon: 'snow',
    desc: 'No 1vX, o tempo desacelera pra você.', effect: { attr: { clutch: 1, composure: 1 }, matchFactor: { label: 'Clutch', delta: 8 } } },

  // ── IGL ─────────────────────────────────────────────────────────────────
  { id: 'i_default', tree: 'IGL', tier: 1, reqLevel: 1, label: 'Mid-round caller', icon: 'brain',
    desc: 'Lê o mid-round e ajusta a chamada na hora.', effect: { attr: { decisions: 1 }, matchFactor: { label: 'Mid-round', delta: 5 } } },
  { id: 'i_master', tree: 'IGL', tier: 2, reqLevel: 5, reqPerk: 'i_default', label: 'Mente mestra', icon: 'balance',
    desc: 'Comanda o time e enxerga o jogo de cima.', effect: { attr: { leadership: 1, gameSense: 1 } } },
  { id: 'i_eco', tree: 'IGL', tier: 3, reqLevel: 12, reqPerk: 'i_master', label: 'Antecipa o eco', icon: 'chart',
    desc: 'Adivinha a economia e o setup do adversário.', effect: { attr: { anticipation: 1 }, matchFactor: { label: 'Leitura de eco', delta: 7 } } },
];

export function perkById(id: string): PerkDef | undefined {
  return PERKS.find((p) => p.id === id);
}

// Árvore relevante pro jogador: universal + a da sua função.
export function perkTreeFor(role: Role): PerkDef[] {
  return PERKS.filter((p) => p.tree === 'universal' || p.tree === role);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAITS — identidade emergente (auto-conquistada pelo estilo de jogo)

export interface TraitDef {
  id: string;
  label: string;
  desc: string;
  icon: RtpIconName;
  // condição de desbloqueio, avaliada sobre os contadores + contexto do jogador.
  earned: (t: ProgressTally, ctx: { matches: number; trophies: number; fame: number; peakOvr: number }) => boolean;
  effect: PerkEffect;
}

export const TRAITS: TraitDef[] = [
  { id: 't_opener', label: 'Abridor nato', icon: 'spark',
    desc: 'Aberturas viraram sua assinatura.', earned: (t) => t.openings >= 25,
    effect: { matchFactor: { label: 'Abridor', delta: 4 } } },
  { id: 't_clutch', label: 'Clutch merchant', icon: 'snow',
    desc: 'O time confia em você no 1vX.', earned: (t) => t.clutches >= 15,
    effect: { matchFactor: { label: 'Clutch', delta: 5 } } },
  { id: 't_head', label: 'Caçador de cabeça', icon: 'crosshair',
    desc: 'Se tem cabeça, você acerta.', earned: (t) => t.hs >= 120,
    effect: { matchFactor: { label: 'HS', delta: 4 } } },
  { id: 't_ice', label: 'Sangue de gelo', icon: 'snow',
    desc: 'Sequências longas sem tremer na mão.', earned: (t) => t.peakStreak >= 6,
    effect: { tiltResist: 0.12 } },
  { id: 't_giant', label: 'Mata-gigante', icon: 'fire',
    desc: 'Cresce contra os favoritos.', earned: (t) => t.bigWins >= 5,
    effect: { matchFactor: { label: 'Grandes jogos', delta: 4 } } },
  { id: 't_vet', label: 'Veterano', icon: 'balance',
    desc: 'Rodagem que só o tempo dá.', earned: (_t, c) => c.matches >= 100,
    effect: { attr: { composure: 1, discipline: 1 } } },
  { id: 't_star', label: 'Estrela', icon: 'fame',
    desc: 'Seu nome enche arena.', earned: (_t, c) => c.fame >= 60,
    effect: { fameMult: 1.2 } },
  { id: 't_champ', label: 'Mentalidade vencedora', icon: 'trophy',
    desc: 'Já sabe o gosto de levantar taça.', earned: (_t, c) => c.trophies >= 1,
    effect: { matchFactor: { label: 'Mentalidade', delta: 3 } } },
];

export function traitById(id: string): TraitDef | undefined {
  return TRAITS.find((t) => t.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Nível / XP

export const MAX_LEVEL = 50;

// XP necessário pra sair do nível L pro L+1 (curva suave e crescente).
export function xpToNext(level: number): number {
  return 60 + level * 30;
}

// XP ganho numa partida do herói.
export function xpForMatch(ctx: { won: boolean; rating: number; mvp: boolean }): number {
  return 25 + Math.round(clamp(ctx.rating, 0, 2) * 20) + (ctx.won ? 15 : 0) + (ctx.mvp ? 15 : 0);
}

export function defaultProgression(): PlayerProgression {
  return {
    level: 1, xp: 0, perkPoints: 0, perks: [], traits: [],
    tally: { wins: 0, openings: 0, clutches: 0, hs: 0, multiKills: 0, bigWins: 0, peakStreak: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Progressão pós-partida (chamada dentro do applyMatchOutcome). PURA.

// Contexto da partida montado pelo matchSim (evita ciclo de import).
export interface MatchProgressCtx {
  won: boolean;
  rating: number;
  mvp: boolean;
  streak: number;          // sequência já atualizada (life.flags.streak pós-partida)
  oppStrength: number;
  ovr: number;
  trophies: number;
  fame: number;
  heroStats: { openings: number; clutches: number; hs: number; multiKills: number };
}

export interface ProgressResult {
  progression: PlayerProgression;
  xpGained: number;
  leveledUp: number;       // quantos níveis subiu (0 se nenhum)
  newLevel: number;
  pointsGained: number;
  newTraits: string[];     // ids de traits conquistados AGORA
}

export function applyMatchProgression(prog: PlayerProgression, ctx: MatchProgressCtx): ProgressResult {
  // 1) contadores vitalícios
  const bigWin = ctx.won && ctx.oppStrength >= ctx.ovr + 4;
  const tally: ProgressTally = {
    wins: prog.tally.wins + (ctx.won ? 1 : 0),
    openings: prog.tally.openings + ctx.heroStats.openings,
    clutches: prog.tally.clutches + ctx.heroStats.clutches,
    hs: prog.tally.hs + ctx.heroStats.hs,
    multiKills: prog.tally.multiKills + ctx.heroStats.multiKills,
    bigWins: prog.tally.bigWins + (bigWin ? 1 : 0),
    peakStreak: Math.max(prog.tally.peakStreak, Math.max(0, ctx.streak)),
  };

  // 2) XP + level up (pode subir mais de um nível numa partida excepcional)
  const xpGained = xpForMatch(ctx);
  let level = prog.level;
  let xp = prog.xp + xpGained;
  let pointsGained = 0;
  while (level < MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    pointsGained += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;

  // 3) traits emergentes (detecta sobre os NOVOS contadores/contexto). t_vet
  //    depende de matchesPlayed (não disponível aqui) → detectado no caller via
  //    detectHistoryTraits; aqui cobrimos os que dependem só de tally/fama/troféus.
  const cCtx = { matches: 0, trophies: ctx.trophies, fame: ctx.fame, peakOvr: ctx.ovr };
  const newTraits: string[] = [];
  const owned = new Set(prog.traits);
  for (const tr of TRAITS) {
    if (owned.has(tr.id) || tr.id === 't_vet') continue;
    if (tr.earned(tally, cCtx)) newTraits.push(tr.id);
  }

  return {
    progression: {
      level, xp,
      perkPoints: prog.perkPoints + pointsGained,
      perks: prog.perks,
      traits: [...prog.traits, ...newTraits],
      tally,
    },
    xpGained,
    leveledUp: level - prog.level,
    newLevel: level,
    pointsGained,
    newTraits,
  };
}

// Detecção de traits que dependem do histórico completo (ex.: t_vet por partidas
// jogadas). Chamada pelo caller com matchesPlayed real. Retorna ids novos.
export function detectHistoryTraits(prog: PlayerProgression, matches: number, trophies: number, fame: number, peakOvr: number): string[] {
  const owned = new Set(prog.traits);
  const cCtx = { matches, trophies, fame, peakOvr };
  const out: string[] = [];
  for (const tr of TRAITS) {
    if (owned.has(tr.id) || !tr.earned(prog.tally, cCtx)) continue;
    out.push(tr.id);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregação de passivos (perks + traits ativos) — consumida pelo match/treino/vida

export interface AggregatePassives {
  attrBonus: Partial<Record<AttrKey, number>>;
  matchFactors: { label: string; delta: number; good: boolean }[];
  tiltResist: number;
  trainingXpMult: number;
  fameMult: number;
}

function foldEffect(agg: AggregatePassives, e: PerkEffect): void {
  if (e.attr) for (const k of Object.keys(e.attr) as AttrKey[]) agg.attrBonus[k] = (agg.attrBonus[k] ?? 0) + (e.attr[k] ?? 0);
  if (e.matchFactor) agg.matchFactors.push({ label: e.matchFactor.label, delta: e.matchFactor.delta, good: e.matchFactor.delta >= 0 });
  if (e.tiltResist) agg.tiltResist += e.tiltResist;
  if (e.trainingXpMult) agg.trainingXpMult *= e.trainingXpMult;
  if (e.fameMult) agg.fameMult *= e.fameMult;
}

export function aggregatePassives(save: RoadToProSave): AggregatePassives {
  const prog = save.player.progression ?? defaultProgression();
  const agg: AggregatePassives = { attrBonus: {}, matchFactors: [], tiltResist: 0, trainingXpMult: 1, fameMult: 1 };
  for (const id of prog.perks) { const p = perkById(id); if (p) foldEffect(agg, p.effect); }
  for (const id of prog.traits) { const t = traitById(id); if (t) foldEffect(agg, t.effect); }
  agg.tiltResist = clamp(agg.tiltResist, 0, 0.6);
  return agg;
}

// Só o bônus de atributo (dobrado no effectiveAttrs — entra no roll real).
export function perkAttrBonus(save: RoadToProSave): Partial<Record<AttrKey, number>> {
  return aggregatePassives(save).attrBonus;
}

// Fatores visíveis das perks/traits pro Round Room (append em prep.factors).
export function perkMatchFactors(save: RoadToProSave): { label: string; delta: number; good: boolean }[] {
  return aggregatePassives(save).matchFactors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desbloqueio de perks (gasta ponto)

export interface UnlockCheck { ok: boolean; reason?: string }

export function canUnlock(save: RoadToProSave, perkId: string): UnlockCheck {
  const prog = save.player.progression ?? defaultProgression();
  const def = perkById(perkId);
  if (!def) return { ok: false, reason: 'Perk inexistente.' };
  if (prog.perks.includes(perkId)) return { ok: false, reason: 'Já desbloqueado.' };
  if (def.tree !== 'universal' && def.tree !== save.player.role) return { ok: false, reason: 'Fora da sua função.' };
  if (prog.perkPoints < 1) return { ok: false, reason: 'Sem pontos de perk.' };
  if (prog.level < def.reqLevel) return { ok: false, reason: `Requer nível ${def.reqLevel}.` };
  if (def.reqPerk && !prog.perks.includes(def.reqPerk)) {
    const pre = perkById(def.reqPerk);
    return { ok: false, reason: `Requer "${pre?.label ?? def.reqPerk}".` };
  }
  return { ok: true };
}

export function unlockPerk(save: RoadToProSave, perkId: string): RoadToProSave {
  if (!canUnlock(save, perkId).ok) return save;
  const prog = save.player.progression;
  return {
    ...save,
    player: {
      ...save.player,
      progression: { ...prog, perkPoints: prog.perkPoints - 1, perks: [...prog.perks, perkId] },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legado / marcos de carreira (display)

export function legacyScore(save: RoadToProSave): number {
  const prog = save.player.progression ?? defaultProgression();
  const h = save.history;
  // Prêmios individuais pesam no legado: MVP de campeonato vale mais que EVP.
  const acc = h.accolades ?? [];
  const accoladePts = acc.reduce((s, a) => s + (a.kind === 'mvp' ? 30 : 15), 0);
  // Chegar ao topo do mundo é feito de lenda: bônus pelo melhor ranking já atingido.
  const peak = save.world.peakRank;
  const peakPts = typeof peak === 'number' ? (peak <= 1 ? 120 : peak <= 5 ? 80 : peak <= 20 ? 45 : peak <= 50 ? 20 : 0) : 0;
  return Math.round(
    prog.level * 6 +
    h.trophies.length * 40 +
    h.awards.length * 25 +
    h.mvps * 6 +
    accoladePts +
    peakPts +
    save.player.ovr +
    prog.traits.length * 12,
  );
}

export interface LegacyTier { label: string; min: number }
const LEGACY_TIERS: LegacyTier[] = [
  { label: 'Lenda', min: 700 },
  { label: 'Estrela', min: 450 },
  { label: 'Profissional', min: 250 },
  { label: 'Promessa', min: 130 },
  { label: 'Prospecto', min: 0 },
];
export function legacyTier(score: number): string {
  return (LEGACY_TIERS.find((t) => score >= t.min) ?? LEGACY_TIERS[LEGACY_TIERS.length - 1]).label;
}

export interface Milestone { id: string; label: string; icon: RtpIconName; done: (save: RoadToProSave) => boolean; }
export const MILESTONES: Milestone[] = [
  { id: 'm_debut', label: 'Estreia profissional', icon: 'calendar', done: (s) => s.history.matchesPlayed >= 1 },
  { id: 'm_win', label: 'Primeira vitória', icon: 'check', done: (s) => (s.player.progression?.tally.wins ?? 0) >= 1 },
  { id: 'm_10', label: '10 partidas na estrada', icon: 'chart', done: (s) => s.history.matchesPlayed >= 10 },
  { id: 'm_mvp', label: 'Primeiro MVP', icon: 'fame', done: (s) => s.history.mvps >= 1 },
  { id: 'm_lvl10', label: 'Nível 10', icon: 'arrowUp', done: (s) => (s.player.progression?.level ?? 1) >= 10 },
  { id: 'm_title', label: 'Primeiro título', icon: 'trophy', done: (s) => s.history.trophies.length >= 1 },
  { id: 'm_100', label: '100 partidas', icon: 'calendar', done: (s) => s.history.matchesPlayed >= 100 },
  { id: 'm_ovr85', label: 'OVR 85', icon: 'spark', done: (s) => s.history.peakOvr >= 85 },
  { id: 'm_lvl25', label: 'Nível 25', icon: 'arrowUp', done: (s) => (s.player.progression?.level ?? 1) >= 25 },
];

export function milestoneProgress(save: RoadToProSave): { done: number; total: number } {
  const done = MILESTONES.filter((m) => m.done(save)).length;
  return { done, total: MILESTONES.length };
}
