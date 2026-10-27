// MODO MAJOR SINGAPORE 2026 — PGL Major Singapore (24/11 a 13/12/2026).
// Formato real: Stage 1 (16 times) → Stage 2 (8 classificados + 8 seeds) →
// Stage 3 (8 + 8) → Champions Stage (8, mata-mata). Cada Stage é um Swiss que
// reaproveita o engine de swiss.ts (createSwissStage / stageAdvancers /
// createPlayoffStage / resolveRound). A lista de times vem de UM JSON só:
// src/data/major-singapore-2026.json (trocar lá quando sair a oficial, 02/11).
import type { Player, TeamSeason, Tournament, TTeam } from '../../types';
import { teamSeasonToTTeam } from '../ratings';
import { makeRng, type Rng } from '../rng';
import { createPlayoffStage, createValveSwissStage, resolveRound, stageAdvancers } from '../swiss';

// provisional = vaga é placeholder do ranking; stageGuess = time praticamente garantido,
// mas o Stage de entrada é palpite (fonte não define) até a lista oficial.
export interface MajorEntry { team: string; bo3Id: string; stage: 1 | 2 | 3; provisional: boolean; stageGuess?: boolean; note?: string }
export interface StandIn { bo3Id: string; out: string; in: Player }
export interface MajorConfig {
  event: string; dates: string; listStatus: string; updatedAt: string;
  teams: MajorEntry[]; standIns?: StandIn[];
}

export const EVENT_NAME = 'PGL Major Singapore 2026';

export function validateConfig(cfg: MajorConfig, dataset: TeamSeason[]): string[] {
  const errs: string[] = [];
  const ids = new Set(dataset.map((t) => t.id));
  if (cfg.teams.length !== 32) errs.push(`esperado 32 times, veio ${cfg.teams.length}`);
  for (const s of [1, 2, 3] as const) {
    const n = cfg.teams.filter((t) => t.stage === s).length;
    const want = s === 1 ? 16 : 8;
    if (n !== want) errs.push(`stage ${s}: esperado ${want}, veio ${n}`);
  }
  const byId = new Map(dataset.map((t) => [t.id, t]));
  for (const t of cfg.teams) {
    const n = byId.get(t.bo3Id)?.players.length ?? 0;
    if (byId.has(t.bo3Id) && n < 5) errs.push(`${t.team} tem só ${n} jogador(es) na base bo3.gg (precisa de 5)`);
  }
  const seen = new Set<string>();
  for (const t of cfg.teams) {
    if (!ids.has(t.bo3Id)) errs.push(`bo3Id desconhecido: ${t.bo3Id} (${t.team})`);
    if (seen.has(t.bo3Id)) errs.push(`time duplicado: ${t.team}`);
    seen.add(t.bo3Id);
  }
  return errs;
}

export interface MajorField { s1: TTeam[]; s2: TTeam[]; s3: TTeam[]; all: TTeam[]; provisional: Set<string>; stageGuess: Set<string> }

// Monta os TTeam (força/elencos) a partir da base bo3.gg, aplicando stand-ins.
export function buildField(cfg: MajorConfig, dataset: TeamSeason[]): MajorField {
  const errs = validateConfig(cfg, dataset);
  if (errs.length) throw new Error(`major-singapore-2026.json inválido: ${errs.join('; ')}`);
  const byId = new Map(dataset.map((t) => [t.id, t]));
  const toTT = (e: MajorEntry): TTeam => {
    let ts = byId.get(e.bo3Id)!;
    const subs = (cfg.standIns ?? []).filter((s) => s.bo3Id === e.bo3Id);
    if (subs.length) {
      let players = [...ts.players];
      for (const s of subs) players = players.map((p) => (p.nick === s.out ? s.in : p));
      ts = { ...ts, players };
    }
    return teamSeasonToTTeam(ts);
  };
  const of = (s: 1 | 2 | 3) => cfg.teams.filter((t) => t.stage === s).map(toTT);
  const s1 = of(1), s2 = of(2), s3 = of(3);
  return { s1, s2, s3, all: [...s1, ...s2, ...s3], provisional: new Set(cfg.teams.filter((t) => t.provisional).map((t) => t.bo3Id)), stageGuess: new Set(cfg.teams.filter((t) => t.stageGuess).map((t) => t.bo3Id)) };
}

export interface MajorRun {
  stages: Tournament[]; // [stage1, stage2, stage3, playoffs]
  passedS1: string[]; passedS2: string[]; playoffs: string[];
  semis: string[]; finalists: string[]; championId: string;
}

const fresh = (t: TTeam): TTeam => ({ ...t, wins: 0, losses: 0, roundDiff: 0, status: 'alive' });

function runToDone(t: Tournament, rng: Rng): Tournament {
  let guard = 0;
  while (t.phase !== 'done' && guard++ < 30) resolveRound(t, rng);
  return t;
}

// Simula um Major inteiro (100% IA, determinístico pelo rng).
export function simulateMajor(field: MajorField, rng: Rng): MajorRun {
  const st1 = runToDone(createValveSwissStage(field.s1.map(fresh), `${EVENT_NAME} · Stage 1`), rng);
  const a1 = stageAdvancers(st1);
  const st2 = runToDone(createValveSwissStage([...field.s2, ...a1].map(fresh), `${EVENT_NAME} · Stage 2`), rng);
  const a2 = stageAdvancers(st2);
  const st3 = runToDone(createValveSwissStage([...field.s3, ...a2].map(fresh), `${EVENT_NAME} · Stage 3`), rng);
  const a3 = stageAdvancers(st3);
  const po = createPlayoffStage(a3.map(fresh), `${EVENT_NAME} · Champions Stage`);
  const semis: string[] = []; const finalists: string[] = [];
  let guard = 0;
  while (po.phase !== 'done' && guard++ < 10) {
    if (po.phase === 'semis') semis.push(...po.pairings.flatMap((p) => [p.a, p.b]));
    if (po.phase === 'final') finalists.push(...po.pairings.flatMap((p) => [p.a, p.b]));
    resolveRound(po, rng);
  }
  return {
    stages: [st1, st2, st3, po],
    passedS1: a1.map((t) => t.id), passedS2: a2.map((t) => t.id), playoffs: a3.map((t) => t.id),
    semis, finalists, championId: po.championId!,
  };
}

export interface TeamOdds {
  id: string; team: string; tag: string; entryStage: 1 | 2 | 3; provisional: boolean; stageGuess?: boolean; strength: number;
  // probabilidades (0..1). passStage1 só faz sentido pra quem entra no Stage 1 etc.
  passStage1: number | null; passStage2: number | null; playoffs: number; semis: number; final: number; title: number;
}
export interface Prediction { event: string; listStatus: string; sims: number; seed: number; generatedFrom: string; teams: TeamOdds[] }

// Monte Carlo: N Majors com seeds derivadas de `seed` (reprodutível).
export function monteCarlo(cfg: MajorConfig, dataset: TeamSeason[], sims = 1000, seed = 20261124): Prediction {
  const field = buildField(cfg, dataset);
  const c = new Map<string, { s1: number; s2: number; po: number; sf: number; f: number; w: number }>();
  for (const t of field.all) c.set(t.id, { s1: 0, s2: 0, po: 0, sf: 0, f: 0, w: 0 });
  const rng = makeRng(seed);
  for (let i = 0; i < sims; i++) {
    const r = simulateMajor(field, rng);
    for (const id of r.passedS1) c.get(id)!.s1++;
    for (const id of r.passedS2) c.get(id)!.s2++;
    for (const id of r.playoffs) c.get(id)!.po++;
    for (const id of r.semis) c.get(id)!.sf++;
    for (const id of r.finalists) c.get(id)!.f++;
    c.get(r.championId)!.w++;
  }
  const entry = new Map(cfg.teams.map((e) => [e.bo3Id, e]));
  const teams: TeamOdds[] = field.all.map((t) => {
    const k = c.get(t.id)!; const e = entry.get(t.id)!;
    return {
      id: t.id, team: t.name, tag: t.tag, entryStage: e.stage, provisional: e.provisional, stageGuess: !!e.stageGuess, strength: Math.round(t.strength * 10) / 10,
      passStage1: e.stage === 1 ? k.s1 / sims : null,
      passStage2: e.stage <= 2 ? k.s2 / sims : null,
      playoffs: k.po / sims, semis: k.sf / sims, final: k.f / sims, title: k.w / sims,
    };
  }).sort((a, b) => b.title - a.title || b.playoffs - a.playoffs);
  return { event: cfg.event, listStatus: cfg.listStatus, sims, seed, generatedFrom: `lista ${cfg.updatedAt} (${cfg.listStatus})`, teams };
}
