// [fase 2 · frente TÁTICA] Tática por mapa — a camada de PREPARAÇÃO da partida.
//
// O que existe aqui (e onde pesa no motor v2, engine/match2):
//   • PAPÉIS por mapa (MapRole): quem abre o site, quem segura, quem é o AWP e
//     quem chama. O papel escolhe a tabela de ENGAJAMENTO do jogador (quem entra
//     nos duelos de abertura, meio e pós-plant) e define o AWPer e o IGL do mapa.
//     Jogar fora do papel natural custa ATRIBUTO EQUIVALENTE no duelo
//     (ROLE_PEN pontos × distância do papel), atenuado pelo oculto `versatility`.
//   • SETUP de CT × EXECUÇÕES do T: pedra-papel-tesoura suave (matriz RPS
//     duplamente centrada: nenhum setup ou execução é melhor na média, só no
//     confronto). A familiaridade de cada lado escala o próprio efeito. O
//     repertório do T é uma MISTURA (mais execuções = menos previsível, mas cada
//     uma menos treinada).
//   • FAMILIARIDADE 0–100 por mapa: coordenação do time no plano (logit de time)
//     e escala da RPS. Cresce com treino (gainFamiliarity, chamada pela frente
//     de treino) e partida no mapa; decai sem uso; mudar o plano custa.
//   • ANTI-STRAT: quem estudou o adversário desloca a própria mistura na
//     direção da MELHOR RESPOSTA ao plano declarado dele (o efeito sai da mesma
//     matriz — contra time imprevisível, estudar rende menos).
//   • INSTRUÇÕES (gerais, com sobrescrita por mapa): ritmo (plant/tempo/meio do
//     round do T), agressividade (abertura × trocas, com encaixe no estilo dos
//     jogadores), utilitária (execução × custo da compra), política de eco
//     (limiar de force/meia-compra/save) e timeouts automáticos (quebram o
//     embalo do adversário).
//
// SEM CONTAGEM DUPLA com o que já existia:
//   • GamePlan/Playbook/identidade tática continuam como estão: são o ajuste de
//     CONTEXTO (lado, pistol, 2º half, chamada de casa). A tática por mapa não
//     soma viés de lado/pistol — só mecanismos (engajamento, compra, plant,
//     trocas, fases) + RPS + familiaridade.
//   • Chamada/postura AO VIVO do time no round (rush, retake, force, save,
//     agressivo, cauteloso) SUBSTITUI o ritmo e a agressividade preparados
//     naquele round (a call é o ajuste ao vivo; o plano é o padrão).
//   • Force/save ao vivo sobrescrevem a compra da política de eco (já era assim).
//   • O plano "Anti-strat" da partida (GamePlan) não soma o bônus genérico
//     quando há preparação de anti-strat contra o adversário: ele passa a
//     COMPROMETER o time com a preparação (leitura ×ANTI_PLAN_FOCUS).
//   • Sem `team.tactics` o motor joga EXATAMENTE como antes (opt-in).
//
// Puro e determinístico: sem RNG, sem relógio, sem React.

import type { MapId, Playstyle, Role, TTeam } from '../../types';
import { MAP_POOL, derivePlaystyle } from '../../types';
import type { CtSetup, MapRole, MapTactic, TacticDuelMods, TacticsState, TExecute, TeamInstructions } from './model';
import { attrsOf } from '../attrs/model';
import { hashStr } from '../../state/hash';

// ─────────────────────────────────────────────────────────────────────────────
// Padrões e catálogos

export const DEFAULT_INSTR: TeamInstructions = { tempo: 'balanced', utility: 'balanced', ecoPolicy: 'forceAfterPistol', aggression: 'balanced', timeoutPolicy: 'normal' };

export function defaultTactics(): TacticsState {
  return { v: 1, instr: { ...DEFAULT_INSTR }, maps: {}, antiStrat: null };
}

// Sem tática configurada, o motor joga exatamente como hoje.
export const NEUTRAL_TACTIC_MODS: TacticDuelMods = { teamLogit: 0 };

export const MAP_ROLES: MapRole[] = ['entry', 'second', 'lurker', 'support', 'awp', 'igl', 'anchor', 'rotator'];
export const CT_SETUPS: CtSetup[] = ['standard', 'stackA', 'stackB', 'aggressive', 'retake'];
export const T_EXECUTES: TExecute[] = ['fastA', 'fastB', 'splitA', 'splitB', 'default', 'midControl', 'fake'];
export const MAX_EXECUTES = 4;

export const MAP_ROLE_LABEL: Record<MapRole, string> = {
  entry: 'Entry', second: 'Segundo', lurker: 'Lurker', support: 'Suporte', awp: 'AWP', igl: 'IGL', anchor: 'Âncora', rotator: 'Rotação',
};
export const MAP_ROLE_DESC: Record<MapRole, string> = {
  entry: 'Abre o site no T e pega o primeiro contato.',
  second: 'Entra colado no entry e troca a morte.',
  lurker: 'Joga longe do time, pega rotação e segura o pós-plant.',
  support: 'Utilitária e flash pro time; troca de trás.',
  awp: 'Leva a AWP: segura ângulo no CT e abre pick no T.',
  igl: 'Chama o jogo. Quem não é IGL chama pior e duela pior.',
  anchor: 'Segura o site sozinho no CT; no T joga de suporte.',
  rotator: 'Roda entre os sites no CT e decide o retake.',
};
export const CT_SETUP_LABEL: Record<CtSetup, string> = {
  standard: 'Padrão 2-1-2', stackA: 'Stack no A', stackB: 'Stack no B', aggressive: 'Agressivo (info)', retake: 'Ceder e retomar',
};
export const CT_SETUP_DESC: Record<CtSetup, string> = {
  standard: 'Distribuição equilibrada. Sofre com split e fake.',
  stackA: 'Três no A. Muralha contra o ataque no A, site B aberto.',
  stackB: 'Três no B. Muralha contra o ataque no B, site A aberto.',
  aggressive: 'Sai pra pegar informação. Pune o T lento, sofre com o rush.',
  retake: 'Cede o site e retoma junto. Forte contra split, fraco contra o meio.',
};
export const T_EXECUTE_LABEL: Record<TExecute, string> = {
  fastA: 'Rush A', fastB: 'Rush B', splitA: 'Split A', splitB: 'Split B', default: 'Default', midControl: 'Controle do meio', fake: 'Fake',
};
export const T_EXECUTE_DESC: Record<TExecute, string> = {
  fastA: 'Os cinco no A, rápido.', fastB: 'Os cinco no B, rápido.',
  splitA: 'Ataque ao A por duas entradas, com utilitária.', splitB: 'Ataque ao B por duas entradas, com utilitária.',
  default: 'Espalha, pega informação e decide no fim do round.', midControl: 'Toma o meio e divide a rotação do CT.',
  fake: 'Finge um site e vai no outro.',
};
export const INSTR_LABEL = {
  tempo: { slow: 'Lento', balanced: 'Equilibrado', fast: 'Rápido' },
  utility: { save: 'Econômica', balanced: 'Equilibrada', heavy: 'Pesada' },
  ecoPolicy: { fullSave: 'Save total', forceAfterPistol: 'Padrão', alwaysForce: 'Sempre forçar' },
  aggression: { passive: 'Passiva', balanced: 'Equilibrada', aggressive: 'Agressiva' },
  timeoutPolicy: { early: 'Cedo', normal: 'Normal', late: 'Tarde' },
} as const;
export const INSTR_DESC = {
  tempo: 'Rápido planta mais e não estoura o tempo, mas chega com menos informação no meio do round. Lento, o contrário.',
  utility: 'Pesada executa, troca e retoma melhor, mas encarece a compra (+$100). Econômica barateia (−$100) e rende menos.',
  ecoPolicy: 'Padrão: força com $2.600 e faz meia-compra após perder o pistol. Save total: só força perto da compra cheia ($3.600) e nunca faz meia. Sempre forçar: força a partir de $1.900 e arma todo eco.',
  aggression: 'Agressiva ganha a abertura e perde trocas; passiva, o contrário. Rende mais com jogadores do mesmo estilo.',
  timeoutPolicy: 'Timeout automático (2 por mapa) depois de 2, 3 ou 4 rounds perdidos seguidos: quebra o embalo do adversário.',
} as const;

// papel natural (Role do jogador) → papel de mapa equivalente. Com o papel
// natural, o engajamento é IDÊNTICO ao do motor sem tática (calibração).
export const NATURAL_MAP_ROLE: Record<Role, MapRole> = {
  Entry: 'entry', Rifler: 'second', Lurker: 'lurker', Support: 'support', AWP: 'awp', IGL: 'igl',
};

// afinidade (0–1) de cada função natural com cada papel de mapa
const ROLE_AFFINITY: Record<Role, Record<MapRole, number>> = {
  Entry: { entry: 1, second: 0.75, rotator: 0.55, anchor: 0.35, support: 0.35, lurker: 0.3, awp: 0.15, igl: 0.25 },
  Rifler: { second: 1, entry: 0.8, rotator: 0.85, anchor: 0.75, support: 0.7, lurker: 0.65, awp: 0.2, igl: 0.3 },
  AWP: { awp: 1, anchor: 0.55, lurker: 0.5, rotator: 0.45, second: 0.4, support: 0.35, entry: 0.25, igl: 0.25 },
  Lurker: { lurker: 1, anchor: 0.75, rotator: 0.7, second: 0.65, support: 0.55, entry: 0.4, awp: 0.2, igl: 0.3 },
  Support: { support: 1, anchor: 0.85, rotator: 0.7, second: 0.65, lurker: 0.5, entry: 0.45, awp: 0.2, igl: 0.45 },
  IGL: { igl: 1, support: 0.75, anchor: 0.6, rotator: 0.55, second: 0.5, lurker: 0.45, entry: 0.35, awp: 0.2 },
};

// Engajamento por papel de mapa: abertura T/CT, meio, pós-plant T/CT.
// Os seis papéis "naturais" repetem EXATAMENTE as tabelas por função do motor
// (W_OPEN_T/W_OPEN_CT/W_MID/W_POST_T/W_POST_CT em match2/engine.ts).
export const MAP_ROLE_W: Record<MapRole, { tOpen: number; ctOpen: number; mid: number; tPost: number; ctPost: number }> = {
  entry: { tOpen: 1.3, ctOpen: 1.4, mid: 1.25, tPost: 0.95, ctPost: 1.2 },
  second: { tOpen: 1.3, ctOpen: 1.2, mid: 1.2, tPost: 1.0, ctPost: 1.1 },
  lurker: { tOpen: 0.7, ctOpen: 1.0, mid: 1.0, tPost: 1.2, ctPost: 1.0 },
  support: { tOpen: 0.75, ctOpen: 0.9, mid: 0.95, tPost: 1.0, ctPost: 1.0 },
  awp: { tOpen: 1.0, ctOpen: 1.1, mid: 1.15, tPost: 1.15, ctPost: 0.9 },
  igl: { tOpen: 0.9, ctOpen: 0.9, mid: 1.0, tPost: 1.0, ctPost: 1.0 },
  anchor: { tOpen: 0.75, ctOpen: 1.35, mid: 0.95, tPost: 1.05, ctPost: 0.95 },
  rotator: { tOpen: 1.2, ctOpen: 0.85, mid: 1.15, tPost: 1.0, ctPost: 1.25 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Constantes do efeito (medidas em scripts/measure-tactics.mts; registradas no
// docs/realismo-fm-fase2.md)

export const FAM_NEUTRAL = 50;     // familiaridade que não soma nem tira
export const FAM_DEFAULT = 50;     // mapa sem plano salvo
export const FAM_FLOOR = 20;       // piso do decaimento sem uso
export const FAM_DECAY = 1.5;      // por série, nos mapas que não foram jogados
export const FAM_MATCH_GAIN = 3;   // por mapa jogado
export const FAM_LOGIT = 0.05;     // logit de duelo por unidade de (fam − 50)/50 — coordenação
export const RPS_LOGIT = 0.06;     // logit de duelo por unidade da matriz RPS
export const ROLE_PEN = 3;         // pontos de atributo fora do papel (afinidade 0, versatilidade baixa)
export const ANTI_MAX = 0.6;       // fração máxima da mistura deslocada pro contra (prontidão 100)
export const ANTI_PLAN_FOCUS = 1.5; // plano "Anti-strat" da partida + preparação: leitura ×1,5 (sem o bônus genérico)
export const EXEC_SPREAD = 0.05;   // cada execução a mais no repertório dilui a familiaridade de execução
export const PISTOL_K = 0.6;       // pistol: mais mira, menos plano
export const TIMEOUTS_PER_MAP = 2;

// custo de familiaridade ao mudar o plano do mapa (como trocar de esquema no FM)
export const CHANGE_COST = { ct: 10, newExec: 5, dropExec: 1, role: 4, instr: 2 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

// ─────────────────────────────────────────────────────────────────────────────
// Matriz RPS (logit a favor do T, por unidade). Desenho: stack pune o rush no
// próprio site e sofre no outro; agressivo pune o lento (default/meio/fake) e
// sofre com rush; ceder-e-retomar pune split, sofre com meio/fake; padrão sofre
// com split/fake. Duplamente centrada: média zero por linha e por coluna.

const M_RAW: Record<CtSetup, Record<TExecute, number>> = {
  standard: { fastA: 0.5, fastB: 0.5, splitA: 1.0, splitB: 1.0, default: -1.0, midControl: -0.5, fake: 0.5 },
  stackA: { fastA: -2.0, fastB: 2.0, splitA: -1.5, splitB: 1.5, default: 1.0, midControl: 0.5, fake: 0.0 },
  stackB: { fastA: 2.0, fastB: -2.0, splitA: 1.5, splitB: -1.5, default: 1.0, midControl: 0.5, fake: 0.0 },
  aggressive: { fastA: 1.5, fastB: 1.5, splitA: 0.0, splitB: 0.0, default: -1.0, midControl: -1.5, fake: -1.5 },
  retake: { fastA: 0.5, fastB: 0.5, splitA: -1.0, splitB: -1.0, default: 0.0, midControl: 1.5, fake: 1.0 },
};

export const RPS: Record<CtSetup, Record<TExecute, number>> = (() => {
  const rowMean: Record<string, number> = {};
  const colMean: Record<string, number> = {};
  let grand = 0;
  for (const s of CT_SETUPS) rowMean[s] = T_EXECUTES.reduce((a, e) => a + M_RAW[s][e], 0) / T_EXECUTES.length;
  for (const e of T_EXECUTES) colMean[e] = CT_SETUPS.reduce((a, s) => a + M_RAW[s][e], 0) / CT_SETUPS.length;
  for (const s of CT_SETUPS) grand += rowMean[s] / CT_SETUPS.length;
  const out = {} as Record<CtSetup, Record<TExecute, number>>;
  for (const s of CT_SETUPS) {
    out[s] = {} as Record<TExecute, number>;
    for (const e of T_EXECUTES) out[s][e] = Math.round((M_RAW[s][e] - rowMean[s] - colMean[e] + grand) * 1000) / 1000;
  }
  return out;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Instruções efetivas, compra e timeouts

export function effectiveInstr(state: TacticsState | null | undefined, map: MapId): TeamInstructions {
  return { ...DEFAULT_INSTR, ...(state?.instr ?? {}), ...(state?.maps?.[map]?.instr ?? {}) };
}

export interface BuyPolicy {
  forceMin: number | null;                     // null = regra atual (2600; técnico agressivo 2300)
  halfBuy: 'afterPistol' | 'never' | 'anyEco'; // meia-compra (colete + pistola melhor) no eco
  saveMult: number;                            // propensão a salvar no eco
  utilCost: number;                            // custo extra da utilitária na compra cheia/force (não muda o limiar)
}

export function buyPolicy(instr: TeamInstructions): BuyPolicy {
  const utilCost = instr.utility === 'heavy' ? 50 : instr.utility === 'save' ? -50 : 0;
  if (instr.ecoPolicy === 'fullSave') return { forceMin: 3400, halfBuy: 'afterPistol', saveMult: 1.15, utilCost };
  if (instr.ecoPolicy === 'alwaysForce') return { forceMin: 1900, halfBuy: 'anyEco', saveMult: 0.8, utilCost };
  return { forceMin: null, halfBuy: 'afterPistol', saveMult: 1, utilCost };
}

/** Sequência de rounds perdidos que dispara o timeout automático. */
export function timeoutThreshold(instr: TeamInstructions): number {
  return instr.timeoutPolicy === 'early' ? 2 : instr.timeoutPolicy === 'late' ? 4 : 3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Papéis: afinidade, encaixe e custo fora da função

export function roleAffinity(role: Role, role2: Role | undefined, mr: MapRole): number {
  const a = ROLE_AFFINITY[role]?.[mr] ?? 0.5;
  const b = role2 ? (ROLE_AFFINITY[role2]?.[mr] ?? 0) * 0.95 : 0;
  return Math.max(a, b);
}

/** Atenuação do custo fora da função pelo oculto `versatility` (1–20). */
export function versatilityAtten(versatility: number): number {
  return clamp(1.3 - versatility / 15, 0.25, 1);
}

export type RolePlayer = Parameters<typeof attrsOf>[0] & { id: string; role: Role; role2?: Role };

/** Pontos de atributo (≤ 0) que o jogador perde no duelo neste papel. */
export function roleFitPts(p: RolePlayer, mr: MapRole): number {
  const aff = roleAffinity(p.role, p.role2, mr);
  if (aff >= 1) return 0;
  const vers = attrsOf(p).h.versatility;
  return -Math.round(ROLE_PEN * (1 - aff) * versatilityAtten(vers) * 100) / 100;
}

export type RoleFitBand = 'natural' | 'adapted' | 'off';
export function roleFitBand(p: { role: Role; role2?: Role }, mr: MapRole): RoleFitBand {
  const aff = roleAffinity(p.role, p.role2, mr);
  return aff >= 0.95 ? 'natural' : aff >= 0.65 ? 'adapted' : 'off';
}

const orgId = (id: string) => id.replace(/^user__/, '');

/** Papel do jogador no mapa (gravado por id, id da org ou id da base; senão o natural). */
export function mapRoleOf(mt: Pick<MapTactic, 'roles'> | null | undefined, p: { id: string; role: Role; sourcePlayerId?: string }): MapRole {
  const r = mt?.roles;
  return (r && (r[p.id] ?? r[orgId(p.id)] ?? (p.sourcePlayerId ? r[p.sourcePlayerId] : undefined))) ?? NATURAL_MAP_ROLE[p.role] ?? 'second';
}

// ─────────────────────────────────────────────────────────────────────────────
// Plano do time no mapa (resolvido uma vez por mapa)

export interface TeamPlan {
  teamId: string;
  map: MapId;
  ids: string[];          // ids dos jogadores por slot (ordem do elenco)
  roles: MapRole[];       // papel por slot
  fit: number[];          // pontos de atributo por slot (≤ 0)
  styles: Playstyle[];    // estilo por slot (encaixe da agressividade)
  util: number;           // utilitária média do elenco (coordenação, APM, comunicação, visão; 1–20)
  awpSlot: number | null; // quem compra a AWP (-1 = ninguém; null = sem papel gravado: o motor escolhe como antes)
  iglSlot: number;        // quem chama (-1 = motor decide como antes)
  ct: CtSetup;
  t: TExecute[];
  instr: TeamInstructions;
  fam: number;            // 0–100
  oppId: string | null;   // adversário estudado
  read: number;           // 0..1 — fração da mistura deslocada pro contra (anti-strat)
}

export function blankMapTactic(map: MapId): MapTactic {
  return { map, roles: {}, ct: 'standard', t: ['default', 'splitA', 'splitB'], familiarity: FAM_DEFAULT };
}

export function mapTacticOf(state: TacticsState | null | undefined, map: MapId): MapTactic {
  const mt = state?.maps?.[map];
  if (!mt) return blankMapTactic(map);
  const t = (mt.t ?? []).filter((e) => T_EXECUTES.includes(e)).slice(0, MAX_EXECUTES);
  return {
    ...mt,
    map,
    roles: mt.roles ?? {},
    ct: CT_SETUPS.includes(mt.ct) ? mt.ct : 'standard',
    t: t.length ? t : ['default'],
    familiarity: clamp(Number.isFinite(mt.familiarity) ? mt.familiarity : FAM_DEFAULT, 0, 100),
  };
}

/** Leitura (0..ANTI_MAX) do anti-strat do dono do estado contra `oppId`. */
export function antiStratReadOf(state: TacticsState | null | undefined, oppId: string | null | undefined): number {
  const as = state?.antiStrat;
  if (!as || !oppId || as.opponentTeamId !== oppId) return 0;
  return clamp((as.readiness ?? 0) / 100, 0, 1) * ANTI_MAX;
}

export type PlanPlayer = RolePlayer & { sourcePlayerId?: string; playstyle?: Playstyle };

export function resolveTeamPlan(state: TacticsState, map: MapId, players: PlanPlayer[], teamId: string, oppId: string | null = null): TeamPlan {
  const mt = mapTacticOf(state, map);
  const roles = players.map((p) => mapRoleOf(mt, p));
  const explicit = players.some((p) => {
    const r = mt.roles;
    return !!(r[p.id] ?? r[orgId(p.id)] ?? (p.sourcePlayerId ? r[p.sourcePlayerId] : undefined));
  });
  const awp = roles.indexOf('awp');
  return {
    teamId, map,
    ids: players.map((p) => p.id),
    roles,
    fit: players.map((p, k) => roleFitPts(p, roles[k])),
    styles: players.map((p) => p.playstyle ?? derivePlaystyle(p.role)),
    util: players.length ? players.reduce((acc, p) => { const a = attrsOf(p).a; return acc + (a.coordination + a.apm + a.communication + a.vision) / 4; }, 0) / players.length : 12,
    awpSlot: awp >= 0 || explicit ? awp : null,
    iglSlot: roles.indexOf('igl'),
    ct: mt.ct,
    t: mt.t,
    instr: effectiveInstr(state, map),
    fam: mt.familiarity,
    oppId,
    read: antiStratReadOf(state, oppId),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RPS com familiaridade e anti-strat

export function execFamiliarity(plan: Pick<TeamPlan, 'fam' | 't'>): number {
  return plan.fam * (1 - EXEC_SPREAD * (plan.t.length - 1));
}

/** Melhor setup de CT contra uma mistura de execuções (a que mais tira do T). */
export function bestSetupVs(execs: TExecute[]): CtSetup {
  let best: CtSetup = 'standard', bv = Infinity;
  for (const s of CT_SETUPS) {
    const v = execs.reduce((a, e) => a + RPS[s][e], 0) / Math.max(1, execs.length);
    if (v < bv - 1e-9) { bv = v; best = s; }
  }
  return best;
}

/** Melhor execução do T contra um setup de CT. */
export function bestExecVs(setup: CtSetup): TExecute {
  let best: TExecute = 'default', bv = -Infinity;
  for (const e of T_EXECUTES) if (RPS[setup][e] > bv + 1e-9) { bv = RPS[setup][e]; best = e; }
  return best;
}

const readVs = (plan: Pick<TeamPlan, 'oppId' | 'read'>, other: Pick<TeamPlan, 'teamId'>) => (plan.oppId && plan.oppId === other.teamId ? plan.read : 0);

export function execMix(tPlan: TeamPlan, ctPlan: TeamPlan): Map<TExecute, number> {
  const mix = new Map<TExecute, number>();
  const r = readVs(tPlan, ctPlan);
  for (const e of tPlan.t) mix.set(e, (mix.get(e) ?? 0) + (1 - r) / tPlan.t.length);
  if (r > 0) { const b = bestExecVs(ctPlan.ct); mix.set(b, (mix.get(b) ?? 0) + r); }
  return mix;
}

export function setupMix(ctPlan: TeamPlan, tPlan: TeamPlan): Map<CtSetup, number> {
  const mix = new Map<CtSetup, number>([[ctPlan.ct, 1]]);
  const r = readVs(ctPlan, tPlan);
  if (r > 0) {
    mix.set(ctPlan.ct, 1 - r);
    const b = bestSetupVs(tPlan.t);
    mix.set(b, (mix.get(b) ?? 0) + r);
  }
  return mix;
}

/** Valor esperado da RPS (unidades; + = favorece o T), já escalado pela familiaridade de cada lado. */
export function rpsValue(tPlan: TeamPlan, ctPlan: TeamPlan): number {
  const eMix = execMix(tPlan, ctPlan);
  const sMix = setupMix(ctPlan, tPlan);
  const qT = 0.4 + (0.6 * execFamiliarity(tPlan)) / 100;
  const qC = 0.4 + (0.6 * ctPlan.fam) / 100;
  let v = 0;
  for (const [e, we] of eMix) for (const [s, ws] of sMix) {
    const m = RPS[s][e];
    v += we * ws * m * (m > 0 ? qT : qC);
  }
  return v;
}

export const famLogit = (fam: number) => (FAM_LOGIT * (fam - FAM_NEUTRAL)) / 50;

// ─────────────────────────────────────────────────────────────────────────────
// O contrato com o motor v2

export interface TacticModsCtx {
  plan: TeamPlan;          // plano do time
  opp: TeamPlan | null;    // plano do adversário (null = adversário sem tática)
  side: 'ct' | 't';
  live?: boolean;          // chamada/postura ao vivo do time neste round → ritmo/agressividade preparados saem
  pistol?: boolean;
}

/**
 * Modificadores da tática para UM lado no round. O motor soma
 * `teamLogit(T) − teamLogit(CT)` ao viés do duelo, `phaseLogit` por fase,
 * `roleFit` no modificador de atributo do jogador, usa `mapRole` para a tabela
 * de engajamento (× `engageWeight` na abertura) e multiplica plant/tempo/trocas/save.
 * A RPS entra só pelo lado T (ela já contém o setup e a familiaridade do CT).
 * Adversário sem tática: a RPS não conta (não há plano pra confrontar).
 */
export function tacticDuelMods(ctx: TacticModsCtx): TacticDuelMods {
  const { plan, opp, side } = ctx;
  const k = ctx.pistol ? PISTOL_K : 1;
  let teamLogit = famLogit(plan.fam);
  if (side === 't' && opp) teamLogit += RPS_LOGIT * rpsValue(plan, opp);
  teamLogit *= k;

  const roleFit: Record<string, number> = {};
  const mapRole: Record<string, MapRole> = {};
  plan.ids.forEach((id, i) => { roleFit[id] = plan.fit[i]; mapRole[id] = plan.roles[i]; });

  const I = plan.instr;
  const pol = buyPolicy(I);
  let plant = 1, trade = 1, time = 1;
  const phase = { open: 0, mid: 0, post: 0 };
  let engageWeight: Record<string, number> | undefined;
  // utilitária (preparação: vale mesmo com call ao vivo): no T executa/planta
  // melhor; no CT retoma melhor (pós-plant). Custa caixa em toda compra e rende
  // conforme a utilitária do elenco (coordenação, APM, comunicação, visão).
  const u = clamp((plan.util - 8) / 8, 0.25, 1.5);
  if (I.utility === 'heavy') { trade *= 1 + 0.04 * u; if (side === 't') plant *= 1 + 0.08 * u; else phase.post += 0.06 * u; }
  else if (I.utility === 'save') { trade *= 1 - 0.03 * u; if (side === 't') plant *= 1 - 0.06 * u; else phase.post -= 0.045 * u; }
  if (!ctx.live) {
    // agressividade: iniciativa na abertura × trocas; rende com o estilo do elenco
    const nAgg = plan.styles.filter((s) => s === 'aggressive').length;
    const nPas = plan.styles.filter((s) => s === 'passive').length;
    const fit = (nAgg - nPas) / 5;
    if (I.aggression === 'aggressive') {
      phase.open += 0.05; trade *= 0.96; phase.mid += 0.04 * fit;
      engageWeight = {};
      plan.ids.forEach((id, i) => { if (plan.styles[i] === 'aggressive') engageWeight![id] = 1.2; });
    } else if (I.aggression === 'passive') {
      phase.open -= 0.05; trade *= 1.04; phase.mid -= 0.04 * fit;
      engageWeight = {};
      plan.ids.forEach((id, i) => { if (plan.styles[i] === 'passive') engageWeight![id] = 1.2; });
    }
    // ritmo (fases do round do T): rápido planta mais e não estoura o tempo, mas
    // chega com menos informação no meio do round; lento, o contrário
    if (side === 't') {
      if (I.tempo === 'fast') { plant *= 1.12; time *= 0.6; phase.mid -= 0.03; }
      else if (I.tempo === 'slow') { plant *= 0.9; time *= 1.4; phase.mid += 0.03; }
    }
  }
  const out: TacticDuelMods = { teamLogit, roleFit, mapRole };
  if (engageWeight && Object.keys(engageWeight).length) out.engageWeight = engageWeight;
  if (phase.open || phase.mid || phase.post) out.phaseLogit = { open: phase.open * k, mid: phase.mid * k, post: phase.post * k };
  if (side === 't' && plant !== 1) out.plantMult = plant;
  if (side === 't' && time !== 1) out.timeMult = time;
  if (trade !== 1) out.tradeMult = trade;
  if (pol.saveMult !== 1) out.saveMult = pol.saveMult;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Familiaridade: ganho (treino/partida), decaimento sem uso, custo de mudança

/**
 * Ganho de familiaridade no mapa (treino de tática/scrim da frente de treino,
 * partida jogada). Retorno decrescente perto de 100; pontos negativos tiram.
 * Mapa sem plano salvo ganha um (o padrão) com a familiaridade atualizada.
 */
export function gainFamiliarity(tactics: TacticsState, map: MapId, points: number): TacticsState {
  if (!Number.isFinite(points) || points === 0) return tactics;
  const cur = mapTacticOf(tactics, map);
  const f = cur.familiarity;
  const next = clamp(points > 0 ? f + points * (1 - f / 130) : f + points, 0, 100);
  return { ...tactics, maps: { ...tactics.maps, [map]: { ...(tactics.maps[map] ?? cur), familiarity: r1(next) } } };
}

/** Decaimento sem uso: todo mapa do pool fora de `used` perde `amount` (piso FAM_FLOOR). */
export function decayFamiliarity(tactics: TacticsState, used: MapId[], amount = FAM_DECAY): TacticsState {
  const maps = { ...tactics.maps };
  for (const m of MAP_POOL) {
    if (used.includes(m)) continue;
    const cur = mapTacticOf(tactics, m);
    if (cur.familiarity <= FAM_FLOOR) continue;
    maps[m] = { ...(tactics.maps[m] ?? cur), familiarity: r1(Math.max(FAM_FLOOR, cur.familiarity - amount)) };
  }
  return { ...tactics, maps };
}

/** Fim de série: mapas jogados ganham, os outros decaem. */
export function tacticsAfterSeries(tactics: TacticsState, mapsPlayed: MapId[], famGainMult = 1): TacticsState {
  let t = decayFamiliarity(tactics, mapsPlayed);
  for (const m of mapsPlayed) t = gainFamiliarity(t, m, FAM_MATCH_GAIN * famGainMult);
  return t;
}

/** Custo de familiaridade (pontos ≥ 0) de trocar o plano `from` por `to`. */
export function changeCost(from: MapTactic, to: MapTactic): number {
  let c = 0;
  if (from.ct !== to.ct) c += CHANGE_COST.ct;
  for (const e of to.t) if (!from.t.includes(e)) c += CHANGE_COST.newExec;
  for (const e of from.t) if (!to.t.includes(e)) c += CHANGE_COST.dropExec;
  const ids = new Set([...Object.keys(from.roles), ...Object.keys(to.roles)]);
  for (const id of ids) if (from.roles[id] && to.roles[id] && from.roles[id] !== to.roles[id]) c += CHANGE_COST.role;
  const keys = new Set([...Object.keys(from.instr ?? {}), ...Object.keys(to.instr ?? {})]) as Set<keyof TeamInstructions>;
  for (const key of keys) if ((from.instr?.[key] ?? null) !== (to.instr?.[key] ?? null)) c += CHANGE_COST.instr;
  return c;
}

function pruneInstr(i: Partial<TeamInstructions> | undefined): Partial<TeamInstructions> | undefined {
  if (!i) return undefined;
  const out: Partial<TeamInstructions> = {};
  for (const [key, v] of Object.entries(i)) if (v != null) (out as Record<string, unknown>)[key] = v;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Edita o plano do mapa cobrando familiaridade. `roleBase` completa os papéis
 * que ainda não foram gravados (o papel natural do elenco atual), para que
 * trocar um papel cobre só o que mudou de verdade.
 */
export function editMapTactic(
  tactics: TacticsState,
  map: MapId,
  patch: Partial<Pick<MapTactic, 'roles' | 'ct' | 't' | 'instr'>>,
  roleBase: Record<string, MapRole> = {},
): TacticsState {
  const cur = mapTacticOf(tactics, map);
  const from: MapTactic = { ...cur, roles: { ...roleBase, ...cur.roles } };
  const t = patch.t ? patch.t.filter((e, i, arr) => T_EXECUTES.includes(e) && arr.indexOf(e) === i).slice(0, MAX_EXECUTES) : from.t;
  const to: MapTactic = {
    ...from,
    ct: patch.ct ?? from.ct,
    roles: patch.roles ? { ...from.roles, ...patch.roles } : from.roles,
    t: t.length ? t : from.t,
    instr: 'instr' in patch ? pruneInstr(patch.instr) : from.instr,
  };
  const cost = changeCost(from, to);
  to.familiarity = r1(clamp(from.familiarity - cost, 0, 100));
  if (!to.instr) delete to.instr;
  return { ...tactics, maps: { ...tactics.maps, [map]: to } };
}

/** Instruções gerais (valem em todo mapa sem sobrescrita); mudar custa em todos. */
export function editInstructions(tactics: TacticsState, patch: Partial<TeamInstructions>): TacticsState {
  const instr = { ...DEFAULT_INSTR, ...tactics.instr, ...patch };
  const changed = (Object.keys(patch) as (keyof TeamInstructions)[]).filter((key) => tactics.instr?.[key] !== instr[key]).length;
  if (!changed) return tactics;
  const maps = { ...tactics.maps };
  for (const m of MAP_POOL) {
    const cur = mapTacticOf(tactics, m);
    maps[m] = { ...(tactics.maps[m] ?? cur), familiarity: r1(clamp(cur.familiarity - CHANGE_COST.instr * changed, 0, 100)) };
  }
  return { ...tactics, instr, maps };
}

// ─────────────────────────────────────────────────────────────────────────────
// Anti-strat: preparar contra o próximo adversário

/**
 * Quanto do plano do adversário a comissão revela (0–1): base do analista de
 * dados (instalação) + `staffEffects().antiStratRead` (frente de staff; 0 sem
 * comissão). Escala a prontidão inicial e a confiança do relatório na tela.
 */
export function antiStratReveal(antiStratRead: number, analystLevel = 0): number {
  return clamp(0.35 + 0.1 * analystLevel + 0.55 * (Number.isFinite(antiStratRead) ? antiStratRead : 0), 0, 1);
}

/**
 * Começa (ou mantém) a preparação contra `opponentTeamId`; trocar de alvo zera a
 * anterior. `vodPoints` = o VOD da agenda desta semana (`vodPrepPoints` do treino).
 */
export function prepareAntiStrat(tactics: TacticsState, opponentTeamId: string, reveal: number, vodPoints = 0): TacticsState {
  const cur = tactics.antiStrat;
  if (cur && cur.opponentTeamId === opponentTeamId) return tactics;
  return { ...tactics, antiStrat: { opponentTeamId, readiness: Math.round(clamp(20 + 40 * reveal + Math.max(0, vodPoints), 0, 100)) } };
}

/** Soma prontidão contra o adversário estudado (ex.: sessão de VOD da frente de treino). */
export function gainAntiStrat(tactics: TacticsState, opponentTeamId: string, points: number): TacticsState {
  const cur = tactics.antiStrat;
  const base = cur && cur.opponentTeamId === opponentTeamId ? cur.readiness : 0;
  return { ...tactics, antiStrat: { opponentTeamId, readiness: Math.round(clamp(base + points, 0, 100)) } };
}

/** Série jogada contra o adversário estudado: a preparação foi usada. */
export function consumeAntiStrat(tactics: TacticsState, opponentTeamId: string): TacticsState {
  return tactics.antiStrat?.opponentTeamId === opponentTeamId ? { ...tactics, antiStrat: null } : tactics;
}

/** Cópia para a PARTIDA com a leitura focada (plano "Anti-strat"); o save não muda. */
export function focusAntiStrat(tactics: TacticsState, opponentTeamId: string): TacticsState {
  const as = tactics.antiStrat;
  if (!as || as.opponentTeamId !== opponentTeamId) return tactics;
  return { ...tactics, antiStrat: { ...as, readiness: Math.min(100, as.readiness * ANTI_PLAN_FOCUS) } };
}

export const hasAntiStratVs = (tactics: TacticsState | null | undefined, opponentTeamId: string | null | undefined): boolean =>
  !!opponentTeamId && tactics?.antiStrat?.opponentTeamId === opponentTeamId && (tactics.antiStrat.readiness ?? 0) > 0;

// ─────────────────────────────────────────────────────────────────────────────
// IA: plano coerente com técnico, IGL, playbook e identidade

export type AiTeam = Pick<TTeam, 'id' | 'players' | 'coach' | 'playbook'>;

const unit = (seed: string) => (hashStr(seed) % 10_000) / 10_000;

function pickWeighted<T extends string>(items: [T, number][], seed: string): T {
  const tot = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = unit(seed) * tot;
  for (const [v, w] of items) { r -= Math.max(0, w); if (r < 0) return v; }
  return items[items.length - 1][0];
}

/** Estilo do IGL (quem chama: função IGL, senão o maior `igl`). */
function iglStyle(team: AiTeam): Playstyle {
  if (!team.players.length) return 'balanced';
  const igl = team.players.find((p) => p.role === 'IGL') ?? team.players.find((p) => p.role2 === 'IGL')
    ?? team.players.reduce((b, p) => (p.igl > b.igl ? p : b), team.players[0]);
  return igl.playstyle ?? derivePlaystyle(igl.role);
}

export function aiInstructions(team: AiTeam): TeamInstructions {
  const styles = team.players.map((p) => p.playstyle ?? derivePlaystyle(p.role));
  const nAgg = styles.filter((s) => s === 'aggressive').length;
  const nPas = styles.filter((s) => s === 'passive').length;
  const coach = team.coach?.style;
  const pb = team.playbook;
  const igl = iglStyle(team);
  return {
    tempo: pb === 'fast' || (coach === 'aggressive' && igl === 'aggressive') ? 'fast' : pb === 'controlled' || (igl === 'passive' && coach !== 'aggressive') ? 'slow' : 'balanced',
    utility: pb === 'tactical' || coach === 'tactical' ? 'heavy' : pb === 'fast' ? 'save' : 'balanced',
    ecoPolicy: coach === 'discipline' ? 'fullSave' : 'forceAfterPistol',
    aggression: nAgg >= 3 || (igl === 'aggressive' && nAgg >= 2) ? 'aggressive' : nPas >= 3 || (igl === 'passive' && nPas >= 2) ? 'passive' : 'balanced',
    timeoutPolicy: coach === 'tactical' ? 'early' : coach === 'aggressive' ? 'late' : 'normal',
  };
}

/** Plano de um mapa para a IA: setup/execuções pelo estilo, variação por mapa (hash). */
export function aiMapTactic(team: AiTeam, map: MapId): MapTactic {
  const coach = team.coach?.style;
  const pb = team.playbook;
  const igl = iglStyle(team);
  const aggro = (coach === 'aggressive' ? 1 : 0) + (igl === 'aggressive' ? 1 : 0) + (pb === 'aggressive' || pb === 'fast' ? 1 : 0);
  const calm = (coach === 'discipline' ? 1 : 0) + (igl === 'passive' ? 1 : 0) + (pb === 'controlled' ? 1 : 0);
  const smart = (coach === 'tactical' ? 1 : 0) + (pb === 'tactical' ? 1 : 0);
  const seed = `ai-tac:${team.id}:${map}`;
  const ct = pickWeighted<CtSetup>([
    ['standard', 2 + smart], ['aggressive', 0.6 + 1.4 * aggro], ['retake', 0.6 + 1.4 * calm],
    ['stackA', 0.5 + 0.5 * smart], ['stackB', 0.5 + 0.5 * smart],
  ], `${seed}:ct`);
  const n = smart >= 1 ? 3 + (unit(`${seed}:n`) < 0.4 ? 1 : 0) : aggro >= 2 ? 2 : 2 + (unit(`${seed}:n`) < 0.5 ? 1 : 0);
  const pool: [TExecute, number][] = [
    ['fastA', 0.5 + aggro], ['fastB', 0.5 + aggro], ['splitA', 0.8 + smart], ['splitB', 0.8 + smart],
    ['default', 1 + calm + smart * 0.5], ['midControl', 0.6 + calm], ['fake', 0.4 + smart],
  ];
  const t: TExecute[] = [];
  for (let i = 0; t.length < n && i < 20; i++) t.push(pickWeighted(pool.filter(([x]) => !t.includes(x)), `${seed}:t${i}`));
  const coachQ = ((team.coach?.rating ?? 75) - 75) * 0.35;
  const familiarity = Math.round(clamp(50 + coachQ + (unit(`${seed}:fam`) * 2 - 1) * 10, 25, 85));
  const roles: Record<string, MapRole> = {};
  for (const p of team.players) roles[p.id] = NATURAL_MAP_ROLE[p.role] ?? 'second';
  // sem AWPer de função, a AWP fica com quem o motor já escolheria (função
  // secundária AWP ou mira de AWP ≥ 15,5)
  if (!Object.values(roles).includes('awp')) {
    let pick = team.players.find((p) => p.role2 === 'AWP');
    if (!pick) {
      let bestV = 15.5;
      for (const p of team.players) { const v = attrsOf(p).a.awp; if (v >= bestV) { bestV = v; pick = p; } }
    }
    if (pick) roles[pick.id] = 'awp';
  }
  return { map, roles, ct, t, familiarity };
}

/**
 * Táticas da IA (todos os mapas do pool), coerentes com o técnico, o IGL e o
 * playbook. `vs` = adversário que ela estuda: a prontidão vem do `scouting`
 * (0–1, `scoutingOf` da identidade tática) × AI_PREP.
 */
export const AI_PREP = 0.5;
/** Vazamento de scrim (0–1, `leakAgainst` do treino): quem te viu em scrim ganha até +50 de prontidão contra você. */
export const SCRIM_LEAK_READ = 50;
export function aiTactics(team: AiTeam, vs?: { id: string; scouting: number; leak?: number } | null): TacticsState {
  const maps: Partial<Record<MapId, MapTactic>> = {};
  for (const m of MAP_POOL) maps[m] = aiMapTactic(team, m);
  return {
    v: 1,
    instr: aiInstructions(team),
    maps,
    antiStrat: vs ? { opponentTeamId: vs.id, readiness: Math.round(clamp(clamp(vs.scouting, 0, 1) * AI_PREP * 100 + clamp(vs.leak ?? 0, 0, 1) * SCRIM_LEAK_READ, 0, 100)) } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura para a interface (mesmas funções que o motor usa)

/** logit de duelo → pontos percentuais de round (aprox. em torno de 50%). */
export const logitToRoundPp = (duelLogit: number, cRound = 1.51) => duelLogit * cRound * 25;

export interface PlanEdge {
  fam: number;     // logit da familiaridade (meu − deles)
  rpsT: number;    // meu T × CT deles (logit, + = bom pra mim)
  rpsCT: number;   // T deles × meu CT (logit, + = bom pra mim)
  totalT: number;
  totalCT: number;
}

/** Vantagem do meu plano contra o deles no mapa, por lado (logit de duelo). */
export function planEdge(mine: TeamPlan, theirs: TeamPlan): PlanEdge {
  const fam = famLogit(mine.fam) - famLogit(theirs.fam);
  const rpsT = RPS_LOGIT * rpsValue(mine, theirs);
  const rpsCT = -RPS_LOGIT * rpsValue(theirs, mine);
  return { fam, rpsT, rpsCT, totalT: fam + rpsT, totalCT: fam + rpsCT };
}

// ─────────────────────────────────────────────────────────────────────────────
// Carreira: a tática que vai para a partida

/**
 * Tática do usuário para a série contra `oppId`, e se o bônus GENÉRICO do plano
 * de jogo "Anti-strat" (GamePlan, +2 de força) ainda vale. Sem contagem dupla:
 * com preparação de anti-strat contra ESTE adversário, o plano "Anti-strat"
 * troca o bônus genérico pelo foco na preparação (leitura ×ANTI_PLAN_FOCUS).
 */
export function matchTacticsFor(
  tactics: TacticsState | null | undefined,
  gamePlan: string | null | undefined,
  oppId: string | null | undefined,
  autoReadiness = 0,
): { tactics: TacticsState; genericAntiStrat: boolean } {
  let t = tactics ?? defaultTactics();
  const prepared = hasAntiStratVs(t, oppId);
  // sem preparação manual, o analista estuda o adversário no automático — a
  // MESMA regra da IA (scouting × AI_PREP): quem nunca mexe não fica pra trás
  if (!prepared && oppId && autoReadiness > 0) t = { ...t, antiStrat: { opponentTeamId: oppId, readiness: Math.round(clamp(autoReadiness, 0, 100)) } };
  if (gamePlan !== 'antistrat') return { tactics: t, genericAntiStrat: false };
  if (!prepared || !oppId) return { tactics: t, genericAntiStrat: true };
  return { tactics: focusAntiStrat(t, oppId), genericAntiStrat: false };
}

/** Prontidão automática do analista (sem preparar): a mesma regra da IA. */
export const autoAntiStratReadiness = (scouting: number) => Math.round(clamp(scouting, 0, 1) * AI_PREP * 100);

/** Fim de série na Carreira: familiaridade (jogados sobem, resto decai) e a preparação usada. */
export function tacticsAfterMatch(tactics: TacticsState | null | undefined, mapsPlayed: MapId[], opponentTeamId: string, famGainMult = 1): TacticsState {
  return consumeAntiStrat(tacticsAfterSeries(tactics ?? defaultTactics(), mapsPlayed, famGainMult), opponentTeamId);
}
