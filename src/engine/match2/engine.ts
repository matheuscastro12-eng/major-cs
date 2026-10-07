// MOTOR DE PARTIDA v2 — o round como CADEIA DE DUELOS (realismo FM, fase 1).
//
// Mesma API do v1 (MapSim: step/peekWinProb/lastRollP/momentum/…); os modos só
// trocam a implementação pela flag MATCH_ENGINE (match2/flag.ts).
//
// ROUND (round.ts):
//   compra/utilitária → duelo de ABERTURA (entry do T × quem segura o ângulo
//   no CT; AWP segurando rende) → TROCAS (teamwork/comunicação/reação) → meio
//   de round (game sense, decisões, posição) → PLANT → pós-plant (T segura) ×
//   retake (CT) → CLUTCH (o último vivo usa clutch/frieza/concentração) → fim
//   (eliminação, save, tempo, explosão, desarme) → ECONOMIA.
//   As estatísticas (kills, mortes, dano, KAST, aberturas, trocas, clutches,
//   multi-kills, HS) saem dessa cadeia; nada é distribuído depois do resultado.
//
// ONDE CADA ATRIBUTO PESA (profile.ts):
//   aim, crosshair, reflexes, reaction, headshot, spray, tap, aimMovement, preAim → duelo de rifle
//   awp (+crosshair, reflexes, reaction, positioning)                       → duelo de AWP
//   tap, headshot, aim, aimMovement                                         → pistol round e eco
//   spray, aimMovement, aim, reaction                                       → force (SMG)
//   aimMovement, reaction, preAim, decisions, reflexes                      → abertura do T (entry)
//   crosshair, positioning, anticipation, offAngles                         → abertura do CT (segurar)
//   gameSense, positioning, decisions, anticipation                         → meio de round
//   positioning, composure, discipline, offAngles                           → pós-plant do T
//   decisions, aimMovement, reaction, composure                             → retake do CT
//   clutch, composure, concentration, decisions                             → último vivo (1vX)
//   teamwork, communication, reaction                                       → trocas
//   coordination, apm, communication, vision                                → execução/plant do T
//   leadership, communication, gameSense, decisions, vision                 → IGL (tendência de lado, sem-IGL)
//   headshot                                                                → % de HS dos abates
//   consistency (+ oculto consistencyHidden)                                → variância de mapa a mapa
//   concentration                                                           → queda no fim do mapa
//   stamina                                                                 → fadiga em série longa e prorrogação
//   adaptability                                                            → 2º half e prorrogação
//   ocultos: bigMatch (jogo grande), temperament (sequência de derrotas),
//            consistencyHidden (variância)
//
// TÁTICA (vale igual ao v1, convertido para logit de duelo): força residual
// do time (química, técnico, plano, dificuldade — tudo que não é jogador),
// AI_EDGE, preferência de mapa, forma do dia, estilo do técnico e do IGL,
// playbook × entrosamento, postura, calls (rush/retake/force/save), timeout,
// momentum, leitura de site e identidade tática.
//
// TÁTICA POR MAPA (fase 2, opt-in por `team.tactics`; engine/gestao/tatica.ts):
// papel no mapa → tabela de engajamento, AWPer e IGL do mapa, custo fora da
// função (pontos de atributo); setup CT × execuções T (RPS) e familiaridade →
// viés do duelo; instruções → compra (política de eco, custo de utilitária),
// plant/tempo/meio do round (ritmo), abertura × trocas (agressividade) e
// timeouts automáticos (quebram o embalo). Chamada/postura ao vivo do time
// substitui ritmo/agressividade no round. Tudo entra no MESMO roundEffect de
// step() e peekWinProb(): % mostrado = % rolado.

import type { KillEvent, MapId, MapResult, PlayerMapStats, TPlayer, TTeam } from '../../types';
import type { Call, MapSim, MapSimOpts, SiteCall, SiteRound, BombSite } from '../match';
import type { Rng } from '../rng';
import { attrsOf } from '../attrs/model';
import {
  emptyStats, envNum, iglLean, stanceFitDelta, decideBuy, buyCost, playbookLean, withFullRoster,
  OT_START_MONEY, type BuyTier, type EcoState, type IglInfo, type Stance,
} from '../matchShared';
import { econOf, identityRoundDelta, type IdentityAction } from '../career/teamIdentity';
import { ct } from '../../state/career-i18n';
import { duelProfile, type DuelProfile } from './profile';
import {
  resolveTeamPlan, tacticDuelMods, buyPolicy, timeoutThreshold, withPlanStyle, MAP_ROLE_W, TIMEOUTS_PER_MAP,
  type TeamPlan, type BuyPolicy,
} from '../gestao/tatica';
import type { TacticDuelMods, TeamStyle } from '../gestao/model';
import { emptyStyleStats, type StyleStats } from '../gestao/estilo';
import { conditionDuelMod, conditionStaminaMul } from '../gestao/condicao';
import { DUEL, playRound, winProbT, type RoundPlay, type RoundSpec, type SideSpec, type WeaponClass } from './round';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes (calibradas por scripts/calibrate-engine.mts)

// pontos de força (escala do v1: 28 pontos ≈ 1 logit de ROUND) → logit de DUELO.
// Um round tem ~8 duelos: 1 logit no duelo vira ~C_ROUND logits no round.
export const C_ROUND = 1.51;
export const S2D = 1 / (28 * C_ROUND);
const AI_EDGE = envNum('AI_EDGE', 4);
const MAP_SWING = envNum('MAP_SWING_V2', 3);
const RESIDUAL_CAP = 40;       // guarda contra valores absurdos; o RtP força placar com até +32
const HALF_BUY_MONEY = 1800; // caixa (antes da compra) que paga colete + pistola melhor no eco
// pontos de atributo que quem CHAMA o jogo perde no duelo (a concentração
// amortece). IGL de verdade (função ou composto de chamada ≥ 16) carrega
// CALL_LOAD; num elenco sem ninguém que saiba chamar, o improvisado carrega mais
// (chama pior E duela pior) — além do caos de time sem IGL (−1,5/−1,8 de força).
const CALL_LOAD = envNum('CALL_LOAD_V2', 3.5);
const CALL_LOAD_IMPROVISED = envNum('CALL_LOAD_IMPROVISED_V2', 4.0);

// lado do mapa (logit de duelo; + = favorece o CT). Calibrado contra
// docs/calibration-targets.json (CT% por mapa).
export const MAP_CT_BIAS: Record<string, number> = {
  mirage: 0.035, inferno: 0.045, nuke: 0.11, ancient: 0.06, anubis: -0.07, dust2: 0.0, train: 0.08,
  overpass: 0.06, vertigo: 0.02,
};
const DEFAULT_CT_BIAS = 0.035;

// leitura de site (#20): stack certo = muralha no site; furado = site fraco
const SITE_RIGHT = 0.3;
const SITE_WRONG = 0.18;

// engajamento por função: quem aparece em cada fase do round
const W_OPEN_T: Record<string, number> = { Entry: 1.3, Rifler: 1.3, AWP: 1.0, Lurker: 0.7, Support: 0.75, IGL: 0.9 };
const W_OPEN_CT: Record<string, number> = { AWP: 1.1, Entry: 1.4, Rifler: 1.2, Lurker: 1.0, Support: 0.9, IGL: 0.9 };
const W_OPEN_CT_AWP = 2.6;   // AWPer DE AWP segura a abertura
const W_MID: Record<string, number> = { Entry: 1.25, Rifler: 1.2, AWP: 1.15, Lurker: 1.0, Support: 0.95, IGL: 1.0 };
const W_POST_T: Record<string, number> = { AWP: 1.15, Lurker: 1.2, Entry: 0.95, Rifler: 1.0, Support: 1.0, IGL: 1.0 };
const W_POST_CT: Record<string, number> = { Entry: 1.2, Rifler: 1.1, AWP: 0.9, Lurker: 1.0, Support: 1.0, IGL: 1.0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fin = (v: number | undefined, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

// Força "dos jogadores" na régua do ratings.teamStrengthFromPlayers (a MESMA
// que monta team.strength em Carreira/Draft/Online/Ultimate). O que sobra de
// team.strength acima disso é tudo que NÃO é jogador — química, técnico,
// plano de jogo, dificuldade, bônus do modo — e entra como viés do time. Os
// jogadores entram pelos atributos, duelo a duelo.
function playersBaseline(team: TTeam): number {
  const ps = team.players;
  if (!ps.length) return fin(team.strength, 70);
  const skill = (p: TPlayer) => fin(p.skill, fin(p.aim, 70) * 0.6 + fin(p.consistency, 70) * 0.25 + fin(p.clutch, 70) * 0.15);
  const avgSkill = ps.reduce((s, p) => s + skill(p), 0) / ps.length;
  const maxAwp = Math.max(...ps.map((p) => fin(p.awp, 50)));
  const maxIgl = Math.max(...ps.map((p) => fin(p.igl, 50)));
  return avgSkill * 0.72 + fin(team.teamwork, 70) * 0.28 + Math.max(0, (maxAwp - 70) / 9) + Math.max(0, (maxIgl - 70) / 8);
}

function gauss(rng: Rng): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rótulos de arma do killfeed (cosmético; o PODER vem da classe)

function weaponLabel(cls: WeaponClass, side: 'ct' | 't', rng: Rng): string {
  const r = rng();
  if (cls === 'awp') return 'awp';
  if (cls === 'pistol') return r < 0.1 ? (side === 't' ? 'tec9' : 'deagle') : side === 'ct' ? 'usp' : 'glock';
  if (cls === 'eco' || cls === 'half') return r < 0.45 ? 'deagle' : r < 0.75 ? (side === 't' ? 'tec9' : 'usp') : side === 't' ? 'glock' : 'usp';
  if (cls === 'smg') {
    if (side === 'ct') return r < 0.62 ? 'mp9' : 'deagle';
    return r < 0.48 ? 'mac10' : r < 0.78 ? 'tec9' : 'deagle';
  }
  if (r < 0.012) return 'knife';
  if (r < 0.06) return 'deagle';
  return rng() < 0.9 ? (side === 't' ? 'ak47' : 'm4') : side === 't' ? 'm4' : 'ak47';
}
const UTIL_DMG_P = 0.5;   // chance de a utilitária de um jogador tirar vida de alguém no round
const CHIP_P = 0.55;      // chance de quem perde o duelo tirar vida antes de cair
const HS_BASE: Record<WeaponClass, number> = { rifle: 0.47, awp: 0.1, pistol: 0.52, eco: 0.5, half: 0.5, smg: 0.38 };

// ─────────────────────────────────────────────────────────────────────────────
// Registro de rounds (harness de calibração)

export interface RoundTrace {
  round: number;
  aSide: 'ct' | 't';
  buys: [BuyTier, BuyTier];
  // nível de equipamento como o bo3.gg mede (economy_level): pela arma que a
  // maioria do time leva — -1 eco seco · 0 force (colete+pistola/SMG) · 2 full
  econ: [EconLevel, EconLevel];
  winner: 0 | 1;
  openingTeam: 0 | 1 | -1;
  clutch: [{ vs: number } | null, { vs: number } | null]; // por time (0/1)
  end: RoundPlay['end'];
  planted: boolean;
}

export type EconLevel = -1 | 0 | 2;
function econLevel(classes: WeaponClass[], pistolRound: boolean): EconLevel {
  if (pistolRound) return 0;
  let eco = 0, full = 0;
  for (const c of classes) { if (c === 'eco') eco++; else if (c === 'rifle' || c === 'awp') full++; }
  return full >= 3 ? 2 : eco >= 3 ? -1 : 0;
}

export type MapSimV2 = MapSim & { trace: () => RoundTrace[]; autoTimeouts: () => { round: number; team: 0 | 1 }[] };

interface TeamCtx {
  team: TTeam;
  players: TPlayer[];
  prof: DuelProfile[];
  awper: number;          // slot do AWPer designado (-1 = sem)
  igl: IglInfo;
  hasIgl: boolean;
  residual: number;
  mapForm: number;
  fixedMod: Float64Array; // forma, variância do mapa, bigMatch, fadiga da série, mod de duelo (RtP)
  tradeTeam: number;
  utilAvg: number;
  plan: TeamPlan | null;     // tática por mapa (null = sem tática: motor de antes)
  policy: BuyPolicy | null;  // política de compra da tática
}

export function createMapSimV2(rng: Rng, a0: TTeam, b0: TTeam, map: MapId, pickedBy: 0 | 1 | -1, opts?: MapSimOpts): MapSimV2 {
  const a = withFullRoster(a0);
  const b = withFullRoster(b0);
  const stats: Record<string, PlayerMapStats> = {};
  const identityMods = opts?.identity ?? [];
  for (const p of [...a0.players, ...b0.players, ...a.players, ...b.players]) stats[p.id] ??= emptyStats();
  const mapIndex = Math.max(0, opts?.mapIndex ?? 0);
  const bigMatch = !!opts?.bigMatch;
  // [fase 4 · circuito] LAN/Major pesam o oculto bigMatch com peso parcial (online = 0: motor de antes)
  const pressure = bigMatch ? 1 : Math.max(0, Math.min(1, opts?.pressure ?? 0));
  const duelMods = opts?.duelMods ?? {};

  // tática por mapa de cada time (null = sem tática)
  const planOf = (t: TTeam, o: TTeam): TeamPlan | null => (t.tactics ? resolveTeamPlan(t.tactics, map, t.players, t.id, o.id) : null);
  const plans: [TeamPlan | null, TeamPlan | null] = [planOf(a, b), planOf(b, a)];

  const buildTeam = (t: TTeam, orig: TTeam, plan: TeamPlan | null): TeamCtx => {
    const players = t.players;
    const attrs = players.map((p) => attrsOf(p));
    const prof = players.map((p, i) => duelProfile(p, attrs[i]));
    let awper: number;
    if (plan && plan.awpSlot != null) awper = plan.awpSlot; // o papel AWP do mapa decide quem compra a AWP (sem papel = ninguém)
    else {
      awper = players.findIndex((p) => p.role === 'AWP');
      if (awper < 0) awper = players.findIndex((p) => p.role2 === 'AWP');
      if (awper < 0) {
        let best = -1, bestV = 15.5;
        attrs.forEach((x, i) => { if (x.a.awp >= bestV) { best = i; bestV = x.a.awp; } });
        awper = best;
      }
    }
    let iglSlot = plan && plan.iglSlot >= 0 ? plan.iglSlot : players.findIndex((p) => p.role === 'IGL');
    if (iglSlot < 0) iglSlot = players.findIndex((p) => p.role2 === 'IGL');
    if (iglSlot < 0) iglSlot = prof.reduce((bi, p, i) => (p.igl > prof[bi].igl ? i : bi), 0);
    const igl: IglInfo = { style: prof[iglSlot].style, rating: prof[iglSlot].igl * 5 };
    // com papel de IGL no mapa, quem chama é ele: se não sabe chamar, o time joga sem IGL
    const hasIgl = plan && plan.iglSlot >= 0
      ? players[iglSlot].role === 'IGL' || players[iglSlot].role2 === 'IGL' || igl.rating >= 80
      : players.some((p) => p.role === 'IGL' || p.role2 === 'IGL') || igl.rating >= 80;
    const residual = clamp(fin(orig.strength, 70) - playersBaseline(orig.players.length ? orig : t), -RESIDUAL_CAP, RESIDUAL_CAP);
    const fixedMod = new Float64Array(5);
    for (let k = 0; k < 5; k++) {
      const pr = prof[k];
      const form = (fin(players[k].form, 1) - 1) * 6;
      // variância de mapa a mapa: consistência visível + oculta (mais constante = menos swing)
      const sigma = 1.25 * clamp(1.5 - 0.05 * (0.6 * pr.consistencyHidden + 0.4 * pr.consistency), 0.55, 1.45);
      const swing = gauss(rng) * sigma;
      const big = pressure > 0 ? ((pr.bigMatch - 11) / 9) * 0.8 * pressure : 0;
      // condição do jogador (fase 2 · treino): ritmo e cansaço entram no duelo, e
      // o cansaço amplia o desgaste de mapa a mapa. Sem `cond` (IA) = 0.
      const cond = players[k].cond;
      const fatigue = mapIndex > 0 ? -mapIndex * ((20 - pr.stamina) / 19) * 0.45 * conditionStaminaMul(cond) : 0;
      // quem CHAMA o jogo divide a cabeça entre a mira e a call: o IGL duela
      // pior (a concentração amortece) — mas o time ganha a leitura dele.
      const callLoad = k === iglSlot ? -(hasIgl ? CALL_LOAD : CALL_LOAD_IMPROVISED) * clamp(1.35 - pr.concentration / 20, 0.5, 1.2) : 0;
      fixedMod[k] = form + swing + big + fatigue + callLoad + conditionDuelMod(cond) + fin(duelMods[players[k].id], 0) + (plan ? plan.fit[k] : 0);
    }
    const tw = fin(t.teamwork, 70);
    return {
      team: t, players, prof, awper, igl, hasIgl, residual,
      mapForm: MAP_SWING ? (rng() * 2 - 1) * MAP_SWING : 0,
      fixedMod,
      tradeTeam: clamp(1 + 0.012 * (tw - 70), 0.7, 1.3),
      utilAvg: prof.reduce((s, p) => s + p.util, 0) / 5,
      plan,
      policy: plan ? buyPolicy(plan.instr) : null,
    };
  };
  const tc: [TeamCtx, TeamCtx] = [buildTeam(a, a0, plans[0]), buildTeam(b, b0, plans[1])];

  // modificadores da tática por (time, lado, call ao vivo, pistol) — constantes no mapa
  const modsCache = new Map<string, TacticDuelMods>();
  const tmods = (ti: 0 | 1, side: 'ct' | 't', live: boolean, pistol: boolean): TacticDuelMods | null => {
    const plan = tc[ti].plan;
    if (!plan) return null;
    const key = `${ti}${side}${live ? 1 : 0}${pistol ? 1 : 0}`;
    let m = modsCache.get(key);
    if (!m) {
      m = tacticDuelMods({ plan, opp: tc[ti === 0 ? 1 : 0].plan, side, live, pistol });
      modsCache.set(key, m);
    }
    return m;
  };
  // timeouts automáticos da tática (política de timeout); o time que chama timeout
  // à mão (partida interativa) fica fora
  // [estilo de jogo] estatística do estilo por time (pós-jogo)
  const sStats: [StyleStats, StyleStats] = [emptyStyleStats(), emptyStyleStats()];
  const timeoutsLeft: [number, number] = [TIMEOUTS_PER_MAP, TIMEOUTS_PER_MAP];
  const autoTimeouts: { round: number; team: 0 | 1 }[] = [];

  let scoreA = 0;
  let scoreB = 0;
  let target = 13;
  let ot = false;
  let lastWinner: 0 | 1 | -1 = -1;
  const roundLog: (0 | 1)[] = [];
  const killFeed: KillEvent[] = [];
  const siteLog: SiteRound[] = [];
  const traceLog: RoundTrace[] = [];
  const aStartsCt = rng() < 0.5;
  let halfScore = '';
  let finished = false;
  const teams: [TTeam, TTeam] = [a, b];
  const eco: [EcoState, EcoState] = [{ money: 800, lossStreak: 0 }, { money: 800, lossStreak: 0 }];
  // armas salvas: quem sobreviveu leva a arma pro próximo round (eco/force armado)
  const carry: [(WeaponClass | null)[], (WeaponClass | null)[]] = [[null, null, null, null, null], [null, null, null, null, null]];
  let round = 0;
  let streakTeam: 0 | 1 | -1 = -1;
  let streakLen = 0;
  const MOMENTUM_BY_LEN = [0, 0, 0.7, 1.3, 1.8];
  const momentumDelta = (): number => (streakTeam < 0 || streakLen < 2 ? 0 : MOMENTUM_BY_LEN[Math.min(streakLen, 4)]);

  const sideOf = (r: number): ['ct' | 't', 'ct' | 't'] => {
    const first: 'ct' | 't' = aStartsCt ? 'ct' : 't';
    const second: 'ct' | 't' = aStartsCt ? 't' : 'ct';
    let aSide: 'ct' | 't';
    if (r < 12) aSide = first;
    else if (r < 24) aSide = second;
    else {
      const h = Math.floor((r - 24) / 3);
      aSide = Math.floor((h + 1) / 2) % 2 === 0 ? second : first;
    }
    return [aSide, aSide === 'ct' ? 't' : 'ct'];
  };

  // compra: a política de eco da tática troca os limiares (sem tática, a regra de antes)
  const buyOf = (ti: 0 | 1, isPistol: boolean): BuyTier => {
    const aggressiveCoach = teams[ti].coach?.style === 'aggressive';
    const pol = tc[ti].policy;
    if (!pol || pol.forceMin == null) return decideBuy(eco[ti], isPistol, aggressiveCoach);
    if (isPistol) return 'pistol';
    const m = eco[ti].money;
    if (m >= 4500) return 'full';
    if (m >= (pol.forceMin ?? (aggressiveCoach ? 2300 : 2600))) return 'force';
    return 'eco';
  };
  const utilCostOf = (ti: 0 | 1, tier: BuyTier): number => {
    const pol = tc[ti].policy;
    return pol && (tier === 'full' || tier === 'force') ? pol.utilCost : 0;
  };
  const computeBuys = (): [BuyTier, BuyTier] => {
    const isPistol = round === 0 || round === 12;
    return [buyOf(0, isPistol), buyOf(1, isPistol)];
  };
  let nextBuys = computeBuys();

  // pontos de força do time no round (mesmas alavancas do v1, sem a força-base
  // dos jogadores — essa vem dos duelos)
  const teamPts = (ti: 0 | 1, side: 'ct' | 't', isPistol: boolean, secondHalf: boolean): number => {
    const t = tc[ti];
    const team = t.team;
    const lostLast = lastWinner === (ti === 0 ? 1 : 0);
    const pickedOwnMap = pickedBy === ti;
    let s = t.residual + fin(team.mapPrefs?.[map], 0) * 1.35 + t.mapForm + (fin(team.teamwork, 70) - 70) * 0.12;
    if (!team.isUser && !team.noEdge) s += AI_EDGE;
    if (!t.hasIgl) {
      s -= 1.5;
      if (secondHalf) s -= 1.8;
    }
    const c = team.coach;
    const cPow = Math.max(0, (fin(c?.rating, 75) - 75) / 12);
    if (c?.style === 'tactical' && pickedOwnMap) s += 1.2 + cPow;
    if (c?.style === 'tactical' && !t.hasIgl) s += 1.2;
    if (c?.style === 'aggressive' && side === 't') s += 0.9 + cPow * 0.6;
    if (c?.style === 'discipline' && lostLast && !isPistol) s += 1.4 + cPow * 0.5;
    s += iglLean(team, side, t.igl);
    if (team.playbook && team.playbookFam) {
      s += playbookLean(team.playbook, { side, isPistol, secondHalf, lostLast, pickedOwnMap, eco: nextBuysFor(ti) !== 'full' }).delta * team.playbookFam;
    }
    return s;
  };
  // compra efetiva do round em montagem (lida pelo playbook) — setada no roundEffect
  let curBuys: [BuyTier, BuyTier] = nextBuys;
  const nextBuysFor = (ti: 0 | 1) => curBuys[ti];

  interface Effect {
    spec: RoundSpec;
    aIsT: boolean;
    buys: [BuyTier, BuyTier];
    aSide: 'ct' | 't';
    bSide: 'ct' | 't';
    classes: [WeaponClass[], WeaponClass[]];
    target: number | null;  // P(A) exata quando a identidade tática desloca a %
  }

  const weaponClasses = (ti: 0 | 1, tier: BuyTier): WeaponClass[] =>
    [0, 1, 2, 3, 4].map((k) => {
      if (tier === 'pistol') return 'pistol';
      const carried = carry[ti][k];
      if (tier === 'full') return k === tc[ti].awper ? 'awp' : carried === 'awp' ? 'awp' : 'rifle';
      if (carried) return carried;
      // eco: save seco para comprar cheio no round seguinte. Exceção do CS2: o 2º
      // round de quem perdeu o pistol, com caixa pra colete, vira meia-compra.
      const half = tc[ti].policy?.halfBuy ?? 'afterPistol';
      const afterPistol = half === 'anyEco' || (half === 'afterPistol' && (round === 1 || round === 13));
      return tier === 'force' ? 'smg' : afterPistol && eco[ti].money >= HALF_BUY_MONEY ? 'half' : 'eco';
    });

  const sideSpec = (
    ti: 0 | 1, side: 'ct' | 't', classes: WeaponClass[], tier: BuyTier, mode: Stance | undefined, saveCall: boolean, secondHalf: boolean,
    tm: TacticDuelMods | null,
  ): SideSpec => {
    const t = tc[ti];
    const isT = side === 't';
    const s: SideSpec = {
      base: new Float64Array(5), mod: new Float64Array(5), phase1: new Float64Array(5), sense: new Float64Array(5),
      phase2: new Float64Array(5), clutch: new Float64Array(5), trade: new Float64Array(5), eq: new Float64Array(5),
      awp: new Uint8Array(5), wOpen: new Float64Array(5), wMid: new Float64Array(5), wPost: new Float64Array(5),
      tradeTeam: t.tradeTeam * (tm?.tradeMult ?? 1),
      // política de eco: propensão a salvar no eco natural (o save chamado ao vivo manda)
      saveMult: (tier === 'eco' ? (saveCall ? 2.6 : 1.4) : tier === 'force' ? 1.1 : 1) * (tier === 'eco' && !saveCall ? tm?.saveMult ?? 1 : 1),
    };
    const ls = eco[ti].lossStreak;
    for (let k = 0; k < 5; k++) {
      const p = t.prof[k];
      const cls = classes[k];
      s.base[k] = cls === 'rifle' ? p.rifle : cls === 'awp' ? p.awp : cls === 'smg' ? p.smg : p.pistol;
      s.eq[k] = cls === 'smg' ? DUEL.E_SMG : cls === 'eco' ? DUEL.E_ECO : cls === 'half' ? DUEL.E_HALF : 0;
      s.awp[k] = cls === 'awp' ? 1 : 0;
      // contexto do round: tilt (temperament), fim de mapa (concentration),
      // prorrogação (stamina), 2º half (adaptability)
      let m = t.fixedMod[k];
      if (ls >= 2) m -= Math.min(3, ls - 1) * ((11 - p.temperament) / 10) * 0.35;
      if (round >= 17) m -= ((20 - p.concentration) / 19) * 0.35 * Math.min(1, (round - 16) / 8);
      if (round >= 24) m -= ((20 - p.stamina) / 19) * 0.3;
      if (secondHalf) m += ((p.adaptability - 11) / 9) * 0.4;
      s.mod[k] = m;
      s.phase1[k] = isT ? p.entry : p.hold;
      s.sense[k] = p.sense;
      s.phase2[k] = isT ? p.post : p.retake;
      s.clutch[k] = p.clutch;
      s.trade[k] = p.trade;
      const role = t.players[k].role;
      const st = p.style;
      let styleOpen = st === 'aggressive' ? (isT ? 1.3 : 1.15) : st === 'passive' ? (isT ? 0.8 : 1.0) : 1;
      let styleMid = st === 'aggressive' ? 1.1 : st === 'passive' ? 0.9 : 1;
      if (mode === 'aggressive' && st === 'aggressive') { styleOpen *= 1.3; styleMid *= 1.3; }
      if (mode === 'cautious' && st === 'passive') { styleOpen *= 1.2; styleMid *= 1.2; }
      const mr = t.plan?.roles[k];
      if (mr) {
        // tática por mapa: o PAPEL no mapa decide quem aparece em cada fase
        const W = MAP_ROLE_W[mr];
        s.wOpen[k] = (isT ? W.tOpen : cls === 'awp' ? W_OPEN_CT_AWP : W.ctOpen) * styleOpen * (tm?.engageWeight?.[t.players[k].id] ?? 1);
        s.wMid[k] = W.mid * styleMid * (tm?.engageMid?.[t.players[k].id] ?? 1);
        s.wPost[k] = (isT ? W.tPost : W.ctPost) * (tm?.engagePost?.[t.players[k].id] ?? 1);
      } else {
        s.wOpen[k] = (isT ? W_OPEN_T[role] ?? 1 : cls === 'awp' ? W_OPEN_CT_AWP : W_OPEN_CT[role] ?? 1) * styleOpen;
        s.wMid[k] = (W_MID[role] ?? 1) * styleMid;
        s.wPost[k] = (isT ? W_POST_T[role] : W_POST_CT[role]) ?? 1;
      }
    }
    return s;
  };

  const callModeOf = (ti: 0 | 1, call?: Call, stance?: { team: 0 | 1; mode: Stance }): Stance | undefined => {
    if (call && call.team === ti) {
      if (call.kind === 'rush') return 'aggressive';
      if (call.kind === 'retake') return 'cautious';
    }
    return stance && stance.team === ti ? stance.mode : undefined;
  };

  // READ-ONLY: especificação do round ATUAL dado stance/call/timeout (+ leitura de
  // site, oculta). Fonte ÚNICA de step() e peekWinProb().
  const roundEffect = (
    stance?: { team: 0 | 1; mode: Stance },
    call?: Call,
    boostTeam?: 0 | 1 | null,
    site?: { ctTeam: 0 | 1; correct: boolean },
  ): Effect => {
    const [aSide, bSide] = sideOf(round);
    const isPistol = round === 0 || round === 12;
    const secondHalf = round >= 12;
    const buys = computeBuys();
    const naturalEcon = [econOf(buys[0]), econOf(buys[1])] as const;
    if (call && !isPistol) {
      if (call.kind === 'force') {
        const m = eco[call.team].money;
        if (m >= 4100) buys[call.team] = 'full';
        else if (m >= buyCost('force')) buys[call.team] = 'force';
      }
      if (call.kind === 'save') buys[call.team] = 'eco';
    }
    curBuys = buys;
    let ptsA = teamPts(0, aSide, isPistol, secondHalf);
    let ptsB = teamPts(1, bSide, isPistol, secondHalf);
    if (boostTeam === 0) ptsA += 2.0;
    if (boostTeam === 1) ptsB += 2.0;
    if (stance && stance.mode !== 'default') {
      const sSide = stance.team === 0 ? aSide : bSide;
      const d = stanceFitDelta(teams[stance.team], sSide, stance.mode, tc[stance.team].igl);
      if (stance.team === 0) ptsA += d; else ptsB += d;
    }
    if (call && (call.kind === 'rush' || call.kind === 'retake')) {
      const cSide = call.team === 0 ? aSide : bSide;
      let cd = 0;
      if (call.kind === 'rush') cd = cSide === 't' ? 2.8 : -1.6;
      if (call.kind === 'retake') cd = cSide === 'ct' ? 2.8 : -1.6;
      if (call.team === 0) ptsA += cd; else ptsB += cd;
    }
    const mo = momentumDelta();
    if (streakTeam === 0) ptsA += mo;
    else if (streakTeam === 1) ptsB += mo;
    let diffA = ptsA - ptsB;
    if (isPistol) diffA *= 0.45;

    const aIsT = aSide === 't';
    const tIdx: 0 | 1 = aIsT ? 0 : 1;
    const cIdx: 0 | 1 = aIsT ? 1 : 0;
    const classes: [WeaponClass[], WeaponClass[]] = [weaponClasses(0, buys[0]), weaponClasses(1, buys[1])];
    const saveCall = (ti: 0 | 1) => !!call && call.team === ti && call.kind === 'save';
    // tática por mapa: chamada/postura AO VIVO do time substitui ritmo/agressividade preparados
    const live = (ti: 0 | 1) => (!!call && call.team === ti) || (!!stance && stance.team === ti && stance.mode !== 'default');
    const mT = tmods(tIdx, 't', live(tIdx), isPistol);
    const mC = tmods(cIdx, 'ct', live(cIdx), isPistol);
    const T = sideSpec(tIdx, 't', classes[tIdx], buys[tIdx], callModeOf(tIdx, call, stance), saveCall(tIdx), secondHalf, mT);
    const C = sideSpec(cIdx, 'ct', classes[cIdx], buys[cIdx], callModeOf(cIdx, call, stance), saveCall(cIdx), secondHalf, mC);
    let bias = (aIsT ? diffA : -diffA) * S2D - (MAP_CT_BIAS[map] ?? DEFAULT_CT_BIAS);
    let plantMult = clamp(1 + 0.04 * (tc[tIdx].utilAvg - 12), 0.75, 1.3);
    let phaseBias: [number, number, number] | undefined;
    let timeMult: number | undefined;
    if (mT || mC) {
      bias += (mT?.teamLogit ?? 0) - (mC?.teamLogit ?? 0);
      const pT = mT?.phaseLogit, pC = mC?.phaseLogit;
      if (pT || pC) phaseBias = [(pT?.open ?? 0) - (pC?.open ?? 0), (pT?.mid ?? 0) - (pC?.mid ?? 0), (pT?.post ?? 0) - (pC?.post ?? 0)];
      plantMult *= mT?.plantMult ?? 1;
      if (mT?.timeMult != null) timeMult = mT.timeMult;
      // [estilo de jogo] ceder o site (CT retake) e o peso da mira (variância)
      if (mC?.oppPlantMult != null) plantMult *= mC.oppPlantMult;
    }
    const kMult = mT?.kMult != null || mC?.kMult != null ? (mT?.kMult ?? 1) * (mC?.kMult ?? 1) : undefined;
    const tMode = callModeOf(tIdx, call, stance);
    if (tMode === 'aggressive') plantMult *= 1.15;
    else if (tMode === 'cautious') plantMult *= 0.9;
    if (site) {
      if (site.correct) { bias -= SITE_RIGHT; plantMult *= 0.7; }
      else { bias += SITE_WRONG; plantMult *= 1.35; }
    }
    let spec: RoundSpec = { sides: [T, C], bias, plantMult };
    if (phaseBias) spec.phaseBias = phaseBias;
    if (timeMult != null) spec.timeMult = timeMult;
    if (kMult != null && kMult !== 1) spec.kMult = kMult;

    // [W5] IDENTIDADE TÁTICA: desvio direto de probabilidade (±pp), igual ao v1.
    // No v2 o desvio vira viés de duelo resolvido EXATAMENTE (a cadeia passa a
    // valer a % deslocada) — a % mostrada continua sendo a % jogada.
    let target: number | null = null;
    if (identityMods.length) {
      const pT0 = winProbT(spec);
      const pA0 = aIsT ? pT0 : 1 - pT0;
      let pA = pA0;
      for (const mod of identityMods) {
        const t = mod.team;
        const o: 0 | 1 = t === 0 ? 1 : 0;
        const actionOf = (team: 0 | 1): IdentityAction | undefined =>
          (call && call.team === team) || (stance && stance.team === team)
            ? { call: call && call.team === team ? call.kind : 'default', stance: stance && stance.team === team ? stance.mode : 'default' }
            : undefined;
        const oppMod = identityMods.find((m) => m.team === o);
        const d = identityRoundDelta(mod, {
          ownerSide: t === 0 ? aSide : bSide,
          ownerEcon: naturalEcon[t],
          ownerAction: actionOf(t),
          oppAction: actionOf(o),
          oppAuto: oppMod?.auto ?? !teams[o].isUser,
        });
        if (d.pp !== 0) pA = Math.max(0.03, Math.min(0.97, pA + (t === 0 ? d.pp : -d.pp)));
      }
      if (pA !== pA0) {
        // spec NOVO: as tabelas de duelo ficam em cache por objeto
        spec = { ...spec, bias: spec.bias + solveBias(spec, aIsT ? pA : 1 - pA) };
        target = pA;
      }
    }
    return { spec, aIsT, buys, aSide, bSide, classes, target };
  };

  const pAOf = (e: Effect): number => {
    if (e.target != null) return e.target;
    const pT = winProbT(e.spec);
    return e.aIsT ? pT : 1 - pT;
  };

  // cache de peek por round (a UI pergunta a mesma % várias vezes por render)
  let peekCache = new Map<string, number>();
  const peekWinProb = (forTeam: 0 | 1, stance?: { team: 0 | 1; mode: Stance }, call?: Call, boostTeam?: 0 | 1 | null): number => {
    if (finished) return forTeam === 0 ? (scoreA >= scoreB ? 1 : 0) : (scoreB > scoreA ? 1 : 0);
    const key = `${stance?.team ?? '-'}${stance?.mode ?? '-'}|${call?.team ?? '-'}${call?.kind ?? '-'}|${boostTeam ?? '-'}`;
    let pA = peekCache.get(key);
    if (pA == null) {
      pA = pAOf(roundEffect(stance, call, boostTeam));
      peekCache.set(key, pA);
    }
    return forTeam === 0 ? pA : 1 - pA;
  };

  let lastEffect: Effect | null = null;
  let lastPA: number | null = null;

  const step = (boostTeam?: 0 | 1 | null, stance?: { team: 0 | 1; mode: Stance }, call?: Call, siteCall?: SiteCall): boolean => {
    if (finished) return true;
    peekCache = new Map();
    // #20 — leitura de site (informação oculta): 3 rolls sempre, como no v1
    const rSite = rng(); const rStackDo = rng(); const rStackSite = rng();
    const [aS0] = sideOf(round);
    const tTeam: 0 | 1 = aS0 === 't' ? 0 : 1;
    const ctTeam: 0 | 1 = tTeam === 0 ? 1 : 0;
    const tSite: BombSite = siteCall && siteCall.team === tTeam ? siteCall.site : (rSite < 0.5 ? 'A' : 'B');
    let ctStack: BombSite | null = null;
    if (siteCall && siteCall.team === ctTeam) ctStack = siteCall.site;
    else if (rStackDo < 0.3) ctStack = rStackSite < 0.5 ? 'A' : 'B';
    const siteCorrect: boolean | null = ctStack ? ctStack === tSite : null;
    siteLog.push({ round, tSite, ctStack, correct: siteCorrect });

    const eff = roundEffect(stance, call, boostTeam, siteCorrect == null ? undefined : { ctTeam, correct: siteCorrect });
    lastEffect = eff;
    lastPA = null; // calculada sob demanda (lastRollP) — a amostragem não precisa da DP
    const { buys, aSide, bSide, classes } = eff;
    eco[0].money = Math.max(0, eco[0].money - buyCost(buys[0]) - utilCostOf(0, buys[0]));
    eco[1].money = Math.max(0, eco[1].money - buyCost(buys[1]) - utilCostOf(1, buys[1]));

    // ── o round acontece: cadeia de duelos ──
    const play = playRound(eff.spec, rng);
    const tIdx: 0 | 1 = eff.aIsT ? 0 : 1;
    const toTeam = (side: 0 | 1): 0 | 1 => (side === 0 ? tIdx : tIdx === 0 ? 1 : 0);
    const winner: 0 | 1 = toTeam(play.winner);
    applyRound(play, toTeam, [aSide, bSide], classes, winner);

    {
      const ctI: 0 | 1 = tIdx === 0 ? 1 : 0;
      sStats[tIdx].rounds++; sStats[ctI].rounds++;
      sStats[tIdx].tRounds++; sStats[ctI].ctRounds++;
      if (play.duels.length) sStats[toTeam(play.duels[0].winSide)].openWon++;
      for (const d of play.duels) if (d.trader >= 0) sStats[toTeam(d.loseSide)].trades++;
      if (play.planted) {
        sStats[tIdx].plants++; sStats[ctI].ctPlantsAgainst++;
        if (winner === tIdx) sStats[tIdx].postWon++; else sStats[ctI].retakes++;
      }
      if (play.end === 'time') sStats[ctI].timeWins++;
      for (const side of [0, 1] as const) if (play.clutch[side] && toTeam(side) === winner) sStats[winner].clutchWon++;
    }
    const pistolRound = buys[0] === 'pistol';
    traceLog.push({
      round, aSide, buys, winner,
      econ: [econLevel(classes[0], pistolRound), econLevel(classes[1], pistolRound)],
      openingTeam: play.duels.length ? toTeam(play.duels[0].winSide) : -1,
      clutch: [0, 1].map((ti) => {
        const side = ti === tIdx ? 0 : 1;
        const c = play.clutch[side];
        return c ? { vs: c.vs } : null;
      }) as RoundTrace['clutch'],
      end: play.end, planted: play.planted,
    });

    // armas salvas pro próximo round
    for (const ti of [0, 1] as const) {
      const side = ti === tIdx ? 0 : 1;
      const alive = play.alive[side];
      for (let k = 0; k < 5; k++) {
        const cls = classes[ti][k];
        carry[ti][k] = alive & (1 << k) && (cls === 'rifle' || cls === 'awp') ? cls : null;
      }
    }

    const loser: 0 | 1 = winner === 0 ? 1 : 0;
    eco[winner].money = Math.min(16000, eco[winner].money + 3250);
    eco[winner].lossStreak = 0;
    eco[loser].lossStreak++;
    eco[loser].money = Math.min(16000, eco[loser].money + 1400 + Math.min(4, eco[loser].lossStreak) * 500);

    if (winner === 0) scoreA++;
    else scoreB++;
    roundLog.push(winner);
    lastWinner = winner;
    if (winner === streakTeam) streakLen++;
    else { streakTeam = winner; streakLen = 1; }
    round++;

    if (round === 12) {
      halfScore = `${scoreA}:${scoreB}`;
      // INTERVALO: caixa de pistol, embalo zerado, armas recolhidas. Feito no fim
      // do round 12 (não no começo do 13) pra que a % mostrada antes do pistol
      // do 2º half já veja o estado real — % mostrado = % rolado também aqui.
      eco[0] = { money: 800, lossStreak: 0 };
      eco[1] = { money: 800, lossStreak: 0 };
      streakTeam = -1;
      streakLen = 0;
      for (const c of carry) c.fill(null);
    }
    if (scoreA >= target || scoreB >= target) {
      finished = true;
    } else if (scoreA === 12 && scoreB === 12 && target === 13) {
      target = 16;
      ot = true;
    } else if (ot && scoreA === target - 1 && scoreB === target - 1) {
      target += 3;
    }
    if (round >= 43) finished = true;
    if (!finished && round >= 24 && (round - 24) % 3 === 0) {
      eco[0] = { money: OT_START_MONEY, lossStreak: 0 };
      eco[1] = { money: OT_START_MONEY, lossStreak: 0 };
      for (const c of carry) c.fill(null);
    }
    // timeout automático da tática: quem perdeu N seguidos para e quebra o embalo
    // do adversário. Decidido no FIM do round (estado), então a % do próximo já o vê.
    if (!finished && streakTeam >= 0) {
      const ti: 0 | 1 = streakTeam === 0 ? 1 : 0;
      const plan = tc[ti].plan;
      if (plan && opts?.manualTimeouts !== ti && timeoutsLeft[ti] > 0 && streakLen >= timeoutThreshold(plan.instr)) {
        timeoutsLeft[ti]--;
        autoTimeouts.push({ round, team: ti });
        streakTeam = -1;
        streakLen = 0;
      }
    }
    if (!finished) nextBuys = computeBuys();
    return finished;
  };

  // ── estatísticas do round: tudo sai da cadeia de duelos ──
  const applyRound = (
    play: RoundPlay, toTeam: (side: 0 | 1) => 0 | 1, sides: ['ct' | 't', 'ct' | 't'],
    classes: [WeaponClass[], WeaponClass[]], winner: 0 | 1,
  ) => {
    const ps: [TPlayer[], TPlayer[]] = [tc[0].players, tc[1].players];
    const kills = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const assists = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const dmg = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const hs = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const died = [[false, false, false, false, false], [false, false, false, false, false]];
    const traded = [[false, false, false, false, false], [false, false, false, false, false]];
    const hp = [[100, 100, 100, 100, 100], [100, 100, 100, 100, 100]];
    const alive = [31, 31];
    let openKiller: [number, number] | null = null;

    // utilitária antes do contato (dano de granada/molotov; ninguém morre disso)
    for (const ti of [0, 1] as const) {
      const oi = ti === 0 ? 1 : 0;
      for (let k = 0; k < 5; k++) {
        // AWPer joga menos utilitária (segura a AWP); o resto pela coordenação/visão
        const awpMult = classes[ti][k] === 'awp' ? 0.5 : 1;
        if (rng() < UTIL_DMG_P * awpMult * clamp(tc[ti].prof[k].util / 14, 0.85, 1.1)) {
          const v = Math.floor(rng() * 5);
          const d = Math.min(hp[oi][v] - 1, 8 + Math.floor(rng() * 34));
          if (d > 0) { hp[oi][v] -= d; dmg[ti][k] += d; }
        }
      }
    }
    const kill = (kt: 0 | 1, k: number, vt: 0 | 1, v: number, opening: boolean, trade: boolean) => {
      dmg[kt][k] += hp[vt][v];
      hp[vt][v] = 0;
      kills[kt][k]++;
      died[vt][v] = true;
      alive[vt] &= ~(1 << v);
      const cls = classes[kt][k];
      const killer = ps[kt][k];
      const isHs = rng() < clamp(HS_BASE[cls] * tc[kt].prof[k].hsRate, 0.03, 0.85);
      if (isHs) hs[kt][k]++;
      // assistência: um companheiro vivo (flash/dano) — pesa utilitária
      const mates = alive[kt] & ~(1 << k);
      if (mates && rng() < 0.25) {
        let tot = 0;
        for (let m = 0; m < 5; m++) if (mates & (1 << m)) tot += tc[kt].prof[m].util;
        let r = rng() * tot;
        for (let m = 0; m < 5; m++) {
          if (!(mates & (1 << m))) continue;
          r -= tc[kt].prof[m].util;
          if (r < 0) { assists[kt][m]++; break; }
        }
      }
      killFeed.push({
        round: round + 1, killerId: killer.id, victimId: ps[vt][v].id, killerTeam: kt, victimTeam: vt,
        weapon: weaponLabel(cls, sides[kt], rng), headshot: isHs, opening, trade,
      });
    };
    for (const d of play.duels) {
      const wt = toTeam(d.winSide), lt = toTeam(d.loseSide);
      // quem perdeu o duelo às vezes acerta antes de cair — a AWP não: errou é 0,
      // acertou é abate (o dano de AWP vem quase todo dos abates)
      const loserAwp = classes[lt][d.lose] === 'awp';
      if (rng() < (loserAwp ? 0.08 : CHIP_P)) {
        const chip = Math.min(hp[wt][d.win] - 1, 15 + Math.floor(rng() * 70));
        if (chip > 0) { hp[wt][d.win] -= chip; dmg[lt][d.lose] += chip; }
      }
      kill(wt, d.win, lt, d.lose, d.opening, false);
      if (d.opening) openKiller = [wt, d.win];
      if (d.trader >= 0) {
        kill(lt, d.trader, wt, d.win, false, true);
        traded[lt][d.lose] = true;
      }
    }
    const clutchWin: [number, number] = [-1, -1];
    for (const side of [0, 1] as const) {
      const c = play.clutch[side];
      const ti = toTeam(side);
      if (c && ti === winner) clutchWin[ti] = c.slot;
    }
    for (const ti of [0, 1] as const) {
      const side = sides[ti];
      for (let k = 0; k < 5; k++) {
        const st = stats[ps[ti][k].id];
        const kst = kills[ti][k] > 0 || assists[ti][k] > 0 || !died[ti][k] || traded[ti][k];
        for (const line of [st.both, side === 'ct' ? st.ct : st.t]) {
          line.rounds++;
          line.kills += kills[ti][k];
          line.assists += assists[ti][k];
          line.deaths += died[ti][k] ? 1 : 0;
          line.dmg += dmg[ti][k];
          if (kst) line.kastRounds++;
          if (openKiller && openKiller[0] === ti && openKiller[1] === k) line.openKills++;
          if (clutchWin[ti] === k) line.clutchWins++;
          line.hsKills += hs[ti][k];
          if (kills[ti][k] >= 2) line.mkRounds++;
          if (traded[ti][k]) line.tradedDeaths++;
        }
      }
    }
  };

  return {
    step,
    peekWinProb,
    lastRollP: (forTeam) => {
      if (!lastEffect) return null;
      if (lastPA == null) lastPA = pAOf(lastEffect);
      return forTeam === 0 ? lastPA : 1 - lastPA;
    },
    momentum: () => ({ team: streakTeam, len: streakLen }),
    done: () => finished,
    score: () => [scoreA, scoreB],
    money: () => [eco[0].money, eco[1].money],
    roundLog: () => roundLog,
    killFeed: () => killFeed,
    buys: () => nextBuys,
    side: () => sideOf(round),
    round: () => round,
    lastSite: () => (siteLog.length ? siteLog[siteLog.length - 1] : null),
    stats: () => stats,
    result: (): MapResult => ({
      map,
      pickedBy,
      score: [scoreA, scoreB],
      halves: halfScore ? `${ct('1o half')} ${halfScore}` : '',
      ot,
      winner: scoreA > scoreB ? 0 : 1,
      roundLog,
      killFeed,
      stats,
      ...(tc[0].plan || tc[1].plan ? {
        styleStats: [{ ...sStats[0] }, { ...sStats[1] }] as [StyleStats, StyleStats],
        styles: [tc[0].plan?.style ?? null, tc[1].plan?.style ?? null] as [TeamStyle | null, TeamStyle | null],
      } : {}),
    }),
    style: (ti: 0 | 1) => tc[ti].plan?.style ?? null,
    setStyle: (ti: 0 | 1, style: TeamStyle) => {
      const plan = tc[ti].plan;
      if (!plan || finished) return;
      if (plan.style.t === style.t && plan.style.ct === style.ct) return;
      tc[ti].plan = withPlanStyle(plan, teams[ti].tactics, style);
      modsCache.clear();
      peekCache = new Map();
    },
    trace: () => traceLog,
    autoTimeouts: () => autoTimeouts,
  };
}

// Viés extra de duelo (a favor do T) que faz a cadeia valer exatamente `targetT`.
// Secante em logit — a curva P(viés) é suave e monótona; converge em poucas iterações.
function solveBias(spec: RoundSpec, targetT: number): number {
  const logit = (p: number) => Math.log(p / (1 - p));
  const at = (d: number) => winProbT({ ...spec, bias: spec.bias + d });
  const goal = logit(targetT);
  let d0 = 0, f0 = logit(at(0)) - goal;
  if (Math.abs(f0) < 1e-13) return 0;
  let d1 = -f0 / C_ROUND, f1 = logit(at(d1)) - goal;
  for (let it = 0; it < 40 && Math.abs(f1) > 1e-13; it++) {
    const slope = (f1 - f0) / (d1 - d0);
    if (!Number.isFinite(slope) || slope === 0) break;
    const d2 = d1 - f1 / slope;
    d0 = d1; f0 = f1;
    d1 = d2; f1 = logit(at(d1)) - goal;
  }
  return d1;
}
