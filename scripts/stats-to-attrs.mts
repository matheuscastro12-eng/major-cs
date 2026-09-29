// Pipeline de dados do realismo FM (fase 1, frente A) — ESTATÍSTICA → ATRIBUTOS.
//
// Entrada: src/data/player-stats-2026.json (gerado por fetch-bo3-stats.mts) e a
// base de elencos do commit BASE_REF (para os 5 números legados curados).
// Saída:   src/data/player-attrs-2026.json  { [playerId]: PlayerAttrs & { src } }
//
// 100% determinístico e offline: mesma entrada → mesmo arquivo, byte a byte.
// A fórmula de cada atributo está documentada em docs/realismo-fm-dados.md; as
// constantes abaixo são a fonte da verdade.
//
// Ideia geral (a mesma do FM):
//   1. NÍVEL do jogador (0..1): força do time (ranking bo3), exposição a tier S/A
//      e rating ajustado; na base curada, mistura 50/50 com o OVR legado.
//   2. PERFIL: cada estatística vira um z-score AJUSTADO AO NÍVEL (resíduo de uma
//      regressão linear contra a força do time), então um tier 3 que amassa tier 3
//      não parece o ZywOo, e o apEX não parece fraco só por jogar contra o top 5.
//   3. atributo = base(nível) + spread × combinação dos z-scores + ajuste de função.
//   4. Atributos sem sinal público (liderança, comunicação) saem da função curada
//      (IGL) + experiência (idade e premiação); ocultos sem dado ficam marcados
//      como estimativa no `src`.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { caFromAttrs, deriveAttrs, HIDDEN_KEYS, type HiddenKey, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { ALL_ATTRS, type AttrKey } from '../src/engine/attributes.ts';
import { hashStr } from '../src/state/hash.ts';
import type { Role } from './lib/roles.mts';

export const STATS_FILE = 'src/data/player-stats-2026.json';
export const OUT_FILE = 'src/data/player-attrs-2026.json';

// ─── constantes da fórmula ──────────────────────────────────────────────────
export const K = {
  N0_ROUNDS: 250,      // encolhimento bayesiano das taxas por round (amostra pequena → média)
  N0_CLUTCH: 40,       // idem para % de clutch (tentativas)
  N0_FORM: 8,          // idem para o desvio do rating partida a partida
  N0_SPLIT: 6,         // idem para recortes (vs top-20, depois de derrota)
  MIN_POP_ROUNDS: 150, // quem entra na população de referência dos z-scores
  Z_CLIP: 2.5,
  BASE_LO: 3.5,        // base(nível) = BASE_LO + BASE_SPAN × nível
  BASE_SPAN: 13,
  SPREAD: 2.4,         // quanto 1 desvio-padrão de perfil move o atributo
  W_TEAM: 0.35, W_T1: 0.3, W_PERF: 0.35, // nível pela estatística
  W_LEGACY: 0.5,       // peso do OVR legado curado no nível (só base)
  AWP_PRIMARY: 0.4,    // fatia de rounds como awper para contar como AWP titular
};

type Z = Record<string, number>;
interface S {
  win: string; games: number; rounds: number; wr: number; rating: number; kpr: number; dpr: number; apr: number; adr: number;
  fkpr: number; fdpr: number; tkpr: number; tdpr: number; acc: number; hsAcc: number; hsk: number; flapr: number; utilpr: number; mkpr: number;
  cl: number[];
}
interface Form { n: number; mean: number; sd: number; top: [number, number] | null; rest: [number, number] | null; afterLoss: [number, number] | null; afterWin: [number, number] | null }
interface StatPlayer {
  bo3: number | null; nick: string; age: number | null; status?: string; team?: number | null; joined?: string | null; prize?: number;
  role: Role; roles?: { awp: number; entropy: number; tEntry: number; tLurk: number; ctAnchor: number } | null;
  s: S | null; t1?: { rounds: number; rating: number } | null; adv?: { clutches: number; clutchAtt: number; rounds: number } | null;
  form?: Form | null; coach?: boolean;
}
export interface StatsFile {
  meta: { window: { from: string; to: string } };
  teams: Record<string, { rank: number | null }>;
  players: Record<string, StatPlayer>;
}
export interface Legacy { id: string; role: Role; role2?: Role; aim: number; clutch: number; consistency: number; awp: number; igl: number; age?: number }
export type AttrsOut = PlayerAttrs & { src: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const noise = (id: string, k: string, amp: number) => ((hashStr(`dados:${id}:${k}`) % 10_001) / 10_000 * 2 - 1) * amp; // −amp..+amp
// Φ (normal padrão) por aproximação de Abramowitz-Stegun
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
export function legacyOvr(p: { aim: number; consistency: number; clutch: number; awp: number; igl: number }): number {
  const spec = Math.max(p.awp, p.igl, p.aim);
  return p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25;
}
// força do time pelo ranking do bo3.gg: #1 → 1, #10 → 0.6, #50 → 0.33, #200 → 0.1
export function teamStrength(rank: number | null | undefined): number {
  if (!rank || rank < 1) return 0.12;
  return clamp(1 - Math.log(rank) / Math.log(400), 0.02, 1);
}
// margem de crescimento (CA → PA) por idade
const HEADROOM: [number, number][] = [[16, 60], [17, 55], [18, 48], [19, 40], [20, 33], [21, 26], [22, 20], [23, 14], [24, 9], [25, 6], [26, 4], [27, 2]];
export function headroom(age: number | null | undefined): number {
  const a = age ?? 24;
  if (a <= 16) return 60;
  const hit = HEADROOM.find(([k]) => k === a);
  return hit ? hit[1] : 0;
}

// ─── métricas derivadas por jogador (já encolhidas pela amostra) ────────────
interface Metrics { [k: string]: number }
function metricsOf(p: StatPlayer, pop: { mean: Metrics }): Metrics | null {
  const s = p.s;
  if (!s || s.rounds < 20) return null;
  const n = s.rounds;
  const sh = (v: number, m: number, n0 = K.N0_ROUNDS) => (v * n + m * n0) / (n + n0);
  const raw: Metrics = {
    rating: s.rating, kpr: s.kpr, dpr: s.dpr, apr: s.apr, adr: s.adr, fkpr: s.fkpr, fdpr: s.fdpr, tkpr: s.tkpr,
    acc: s.acc, hsAcc: s.hsAcc, hsk: s.hsk, flapr: s.flapr, utilpr: s.utilpr, mkpr: s.mkpr, wr: s.wr,
    openSucc: s.fkpr / Math.max(1e-6, s.fkpr + s.fdpr),
    tradedShare: s.tdpr / Math.max(1e-6, s.dpr),
    clutchPr: (s.cl[0] + 2 * s.cl[1] + 3 * s.cl[2] + 4 * s.cl[3] + 5 * s.cl[4]) / n,
    games: s.games,
  };
  const out: Metrics = {};
  for (const [k, v] of Object.entries(raw)) out[k] = k === 'games' ? v : pop.mean[k] === undefined ? v : sh(v, pop.mean[k]);
  // clutch %: tentativas do advanced_stats (janela); sem isso, média
  const att = p.adv?.clutchAtt ?? 0;
  const cm = pop.mean.clutchRate ?? 0.12;
  out.clutchRate = att > 0 ? ((p.adv!.clutches / att) * att + cm * K.N0_CLUTCH) / (att + K.N0_CLUTCH) : cm;
  // forma: desvio do rating partida a partida (quanto MENOR, mais consistente)
  const fsd = pop.mean.formSd ?? 0.6;
  out.formSd = p.form ? (p.form.sd * p.form.n + fsd * K.N0_FORM) / (p.form.n + K.N0_FORM) : fsd;
  const split = (a: [number, number] | null | undefined, b: [number, number] | null | undefined) => {
    if (!a || !b) return 0;
    const n2 = Math.min(a[0], b[0]);
    return ((a[1] - b[1]) * n2) / (n2 + K.N0_SPLIT);
  };
  out.bigDelta = split(p.form?.top, p.form?.rest);
  out.tiltDelta = split(p.form?.afterLoss, p.form?.afterWin);
  return out;
}

// z-score ajustado ao nível: resíduo da regressão linear da métrica contra a força do time
function fitResidualZ(rows: { m: Metrics; ts: number; w: number }[], key: string) {
  const W = rows.reduce((s, r) => s + r.w, 0);
  const mx = rows.reduce((s, r) => s + r.w * r.ts, 0) / W;
  const my = rows.reduce((s, r) => s + r.w * r.m[key], 0) / W;
  let sxy = 0, sxx = 0;
  for (const r of rows) { sxy += r.w * (r.ts - mx) * (r.m[key] - my); sxx += r.w * (r.ts - mx) ** 2; }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = my - beta * mx;
  const res = rows.map((r) => r.m[key] - (alpha + beta * r.ts));
  const sd = Math.sqrt(rows.reduce((s, r, i) => s + r.w * res[i] ** 2, 0) / W) || 1;
  return (m: Metrics, ts: number) => clamp((m[key] - (alpha + beta * ts)) / sd, -K.Z_CLIP, K.Z_CLIP);
}

const METRIC_KEYS = ['rating', 'kpr', 'dpr', 'apr', 'adr', 'fkpr', 'fdpr', 'tkpr', 'acc', 'hsAcc', 'hsk', 'flapr', 'utilpr', 'mkpr', 'wr',
  'openSucc', 'tradedShare', 'clutchPr', 'clutchRate', 'formSd', 'bigDelta', 'tiltDelta', 'games'];

// ─── atributos ──────────────────────────────────────────────────────────────
export function buildAllAttrs(stats: StatsFile, legacyById: Map<string, Legacy>): Record<string, AttrsOut> {
  const ids = Object.keys(stats.players).sort();
  const tsOf = (p: StatPlayer) => teamStrength(p.team != null ? stats.teams[String(p.team)]?.rank ?? null : null);
  // médias da população (para o encolhimento) em duas passadas
  const popRaw = ids.map((id) => stats.players[id]).filter((p) => p.s && p.s.rounds >= K.MIN_POP_ROUNDS && !p.coach);
  const mean0: Metrics = {};
  for (const k of ['rating', 'kpr', 'dpr', 'apr', 'adr', 'fkpr', 'fdpr', 'tkpr', 'acc', 'hsAcc', 'hsk', 'flapr', 'utilpr', 'mkpr', 'wr']) {
    mean0[k] = popRaw.reduce((s, p) => s + (p.s as unknown as Record<string, number>)[k], 0) / popRaw.length;
  }
  mean0.openSucc = popRaw.reduce((s, p) => s + p.s!.fkpr / Math.max(1e-6, p.s!.fkpr + p.s!.fdpr), 0) / popRaw.length;
  mean0.tradedShare = popRaw.reduce((s, p) => s + p.s!.tdpr / Math.max(1e-6, p.s!.dpr), 0) / popRaw.length;
  mean0.clutchPr = popRaw.reduce((s, p) => s + (p.s!.cl[0] + 2 * p.s!.cl[1] + 3 * p.s!.cl[2] + 4 * p.s!.cl[3] + 5 * p.s!.cl[4]) / p.s!.rounds, 0) / popRaw.length;
  const withClutch = popRaw.filter((p) => (p.adv?.clutchAtt ?? 0) >= 20);
  mean0.clutchRate = withClutch.reduce((s, p) => s + p.adv!.clutches / p.adv!.clutchAtt, 0) / Math.max(1, withClutch.length);
  const withForm = popRaw.filter((p) => p.form && p.form.n >= 5);
  mean0.formSd = withForm.reduce((s, p) => s + p.form!.sd, 0) / Math.max(1, withForm.length);
  const M = new Map<string, Metrics>();
  for (const id of ids) { const m = metricsOf(stats.players[id], { mean: mean0 }); if (m) M.set(id, m); }
  const popRows = ids.filter((id) => M.has(id) && stats.players[id].s!.rounds >= K.MIN_POP_ROUNDS && !stats.players[id].coach)
    .map((id) => ({ id, m: M.get(id)!, ts: tsOf(stats.players[id]), w: 1 }));
  const zf: Record<string, (m: Metrics, ts: number) => number> = {};
  for (const k of METRIC_KEYS) zf[k] = fitResidualZ(popRows, k);
  // z dentro dos AWPers titulares (para o atributo AWP)
  const isAwp = (id: string) => {
    const p = stats.players[id]; const l = legacyById.get(id);
    return p.role === 'AWP' || l?.role === 'AWP' || l?.role2 === 'AWP' || (p.roles?.awp ?? 0) >= K.AWP_PRIMARY;
  };
  const awpRows = popRows.filter((r) => isAwp(r.id));
  const zAwp: Record<string, (m: Metrics, ts: number) => number> = {};
  for (const k of ['kpr', 'openSucc', 'rating', 'fkpr']) zAwp[k] = fitResidualZ(awpRows, k);
  // tier S/A: z do rating dentro de quem tem amostra lá
  const t1Rows = ids.filter((id) => (stats.players[id].t1?.rounds ?? 0) >= 300);
  const t1Mean = t1Rows.reduce((s, id) => s + stats.players[id].t1!.rating, 0) / Math.max(1, t1Rows.length);
  const t1Sd = Math.sqrt(t1Rows.reduce((s, id) => s + (stats.players[id].t1!.rating - t1Mean) ** 2, 0) / Math.max(1, t1Rows.length)) || 1;
  const maxPrize = 2_500_000;
  const volMean = popRows.reduce((s, r) => s + r.m.games, 0) / popRows.length;
  const volSd = Math.sqrt(popRows.reduce((s, r) => s + (r.m.games - volMean) ** 2, 0) / popRows.length) || 1;

  const out: Record<string, AttrsOut> = {};
  for (const id of ids) {
    const p = stats.players[id];
    const leg = legacyById.get(id);
    if (p.coach && !leg) continue; // técnico que nunca foi jogador da base
    const role: Role = leg?.role ?? p.role;
    const m = p.coach ? undefined : M.get(id); // jogador da base que virou técnico: fica com o legado
    if (!m) {
      // sem estatística pública (aposentado, fictício, não achado): deriva dos 5 legados
      if (!leg) continue;
      const d = deriveAttrs({ ...leg, role });
      const pa = clamp(d.ca + headroom(p.age ?? leg.age), d.ca, 200);
      out[id] = { ...d, pa, src: 'legado (sem estatística pública)' };
      continue;
    }
    const ts = tsOf(p);
    const z: Z = {};
    for (const k of METRIC_KEYS) z[k] = zf[k](m, ts);
    const age = p.age ?? leg?.age ?? 24;
    const prizeN = clamp(Math.log(1 + (p.prize ?? 0) / 20_000) / Math.log(1 + maxPrize / 20_000), 0, 1);
    const exp = 0.5 * clamp((age - 17) / 13, 0, 1) + 0.5 * prizeN; // experiência 0..1
    const expZ = (exp - 0.45) * 3;
    // ── nível ──
    const t1share = p.t1 && p.s ? clamp(p.t1.rounds / p.s.rounds, 0, 1) : 0;
    const perfZ = p.t1 && p.t1.rounds >= 300 ? 0.5 * z.rating + 0.5 * clamp((p.t1.rating - t1Mean) / t1Sd, -K.Z_CLIP, K.Z_CLIP) : z.rating;
    const statsLevel = K.W_TEAM * ts + K.W_T1 * t1share + K.W_PERF * phi(perfZ);
    const legacyLevel = leg ? clamp((legacyOvr(leg) - 55) / 41, 0, 1) : null;
    const level = legacyLevel == null ? statsLevel : (1 - K.W_LEGACY) * statsLevel + K.W_LEGACY * legacyLevel;
    const B = K.BASE_LO + K.BASE_SPAN * level;
    const S = K.SPREAD;
    const isIGL = role === 'IGL' || leg?.role2 === 'IGL';
    const awpShare = p.roles?.awp ?? (role === 'AWP' ? 0.6 : 0.03);
    const primaryAwp = isAwp(id);
    // ajustes por idade (reflexo cai cedo; resistência cai depois dos 30)
    const ageFast = age <= 22 ? 1 : age <= 25 ? 0.4 : age <= 28 ? -0.3 : age <= 31 ? -0.9 : -1.5;
    const ageStam = age <= 27 ? 0.3 : age <= 31 ? 0 : -0.8;
    const volZ = clamp((m.games - volMean) / volSd, -K.Z_CLIP, K.Z_CLIP);
    const consZ = -z.formSd;
    const versZ = p.roles ? clamp((p.roles.entropy - 0.55) / 0.12, -K.Z_CLIP, K.Z_CLIP) : 0;
    const roleAdj: Partial<Record<AttrKey, number>> = {
      AWP: { spray: -1, aimMovement: -0.5 }, Entry: { aimMovement: 0.5, reflexes: 0.5, discipline: 1 },
      Support: { teamwork: 1, coordination: 0.5 }, IGL: { teamwork: 0.5, decisions: 1 }, Lurker: { offAngles: 0.5, anticipation: 0.5 }, Rifler: {},
    }[role] as Partial<Record<AttrKey, number>>;
    const sig: Record<AttrKey, number> = {
      aim: 0.35 * z.kpr + 0.25 * z.adr + 0.2 * z.rating + 0.2 * z.acc,
      aimMovement: 0.4 * z.fkpr + 0.3 * z.kpr + 0.3 * z.mkpr,
      tap: 0.5 * z.hsk + 0.3 * z.acc + 0.2 * z.kpr,
      spray: 0.4 * z.mkpr + 0.3 * z.adr + 0.3 * z.acc,
      awp: 0,
      headshot: 0.7 * z.hsk + 0.3 * z.hsAcc,
      crosshair: 0.4 * z.acc + 0.3 * z.hsAcc + 0.3 * z.openSucc,
      preAim: 0.5 * z.openSucc + 0.3 * z.tkpr + 0.2 * z.acc,
      offAngles: 0.35 * z.openSucc + 0.35 * z.clutchRate - 0.3 * z.dpr,
      gameSense: -0.35 * z.dpr + 0.25 * z.rating + 0.2 * z.clutchRate + 0.2 * expZ,
      decisions: -0.35 * z.dpr + 0.3 * z.wr + 0.35 * expZ,
      anticipation: 0.4 * z.openSucc + 0.3 * z.tkpr - 0.3 * z.dpr,
      composure: 0.5 * z.clutchRate + 0.25 * z.clutchPr + 0.25 * z.bigDelta,
      concentration: 0.5 * consZ + 0.3 * z.rating + 0.2 * expZ,
      positioning: -0.45 * z.dpr + 0.3 * z.tradedShare + 0.25 * expZ,
      clutch: 0.6 * z.clutchRate + 0.4 * z.clutchPr,
      teamwork: 0.35 * z.tkpr + 0.25 * z.tradedShare + 0.25 * z.flapr + 0.15 * z.apr,
      communication: 0.4 * z.flapr + 0.3 * z.apr + 0.3 * expZ,
      leadership: 0,
      adaptability: 0.5 * versZ + 0.25 * z.rating + 0.25 * expZ,
      vision: 0.4 * z.wr - 0.3 * z.dpr + 0.3 * expZ,
      reflexes: 0.5 * z.fkpr + 0.3 * z.openSucc + 0.2 * ageFast,
      reaction: 0.4 * z.openSucc + 0.3 * z.tkpr + 0.3 * ageFast,
      stamina: 0.5 * volZ + 0.5 * ageStam,
      discipline: -0.4 * z.fdpr + 0.3 * consZ + 0.3 * expZ,
      coordination: 0.4 * z.flapr + 0.3 * z.utilpr + 0.3 * z.tkpr,
      apm: 0.5 * z.mkpr + 0.5 * z.fkpr,
      consistency: 0.7 * consZ + 0.3 * z.rating,
    };
    const a = {} as Record<AttrKey, number>;
    for (const k of ALL_ATTRS) a[k] = B + S * sig[k] + (roleAdj[k] ?? 0);
    // AWP: titular é medido contra os outros AWPers; quem não é AWP fica baixo/médio
    if (primaryAwp) {
      a.awp = B + 1.2 + S * (0.4 * zAwp.kpr(m, ts) + 0.3 * zAwp.openSucc(m, ts) + 0.3 * zAwp.rating(m, ts));
    } else {
      a.awp = 2 + 7 * level + 6 * clamp(awpShare / K.AWP_PRIMARY, 0, 1);
    }
    // Liderança, comunicação e visão: o bo3.gg não publica IGL; vêm da função curada + experiência
    if (isIGL) {
      a.leadership = 12.5 + 4 * exp + 1.5 * level + 0.8 * z.wr;
      a.communication = 12 + 4 * exp + 2 * level;
      a.vision = 11.5 + 4 * exp + 2.5 * level + 0.5 * z.wr;
    } else {
      a.leadership = 3 + 6 * exp + 2 * level;
      a.communication = B - 2 + S * sig.communication;
      a.vision = B - 1 + S * sig.vision;
    }
    for (const k of ALL_ATTRS) a[k] = clamp(Math.round(a[k]), 1, 20);
    // ── ocultos ──
    const tenure = p.joined ? Math.max(0, (Date.parse(stats.meta.window.to) - Date.parse(p.joined)) / (365.25 * 864e5)) : 1;
    const h: Record<HiddenKey, number> = {
      bigMatch: 10.5 + 3 * z.bigDelta + 2 * (prizeN - 0.4),
      temperament: 10.5 + 3 * z.tiltDelta + (age >= 27 ? 1 : age <= 20 ? -1 : 0),
      consistencyHidden: 10.5 + 3.5 * consZ,
      professionalism: 11 + 1.3 * expZ + 1.2 * consZ + noise(id, 'prof', 2),
      ambition: 11.5 + 3 * (level - 0.5) + (age <= 24 ? 1.5 : age >= 30 ? -1.5 : 0) + noise(id, 'amb', 3),
      loyalty: 7 + 2.2 * Math.min(tenure, 7) - (p.status !== 'active' ? 1 : 0) + noise(id, 'loy', 2),
      injuryProneness: 7 + 0.35 * Math.max(0, age - 26) + noise(id, 'inj', 3),
      versatility: p.roles ? 5 + 12 * p.roles.entropy + noise(id, 'ver', 1) : 10 + noise(id, 'ver', 2),
    };
    for (const k of HIDDEN_KEYS) h[k] = clamp(Math.round(h[k]), 1, 20);
    const ca = caFromAttrs(a, role);
    const hr = headroom(age) * (0.8 + 0.4 * phi(perfZ)) * (1 + noise(id, 'pa', 0.15));
    const pa = clamp(Math.round(ca + hr), ca, 200);
    out[id] = { v: 1, a, h, ca, pa, src: `bo3.gg ${p.s!.win} (${p.s!.rounds} rounds)` };
  }
  return out;
}

// 5 números legados CURADOS: só dos jogadores que já estavam na base (as chaves de
// meta.playerResolve). Os objetos deles são preservados verbatim na atualização
// de elencos, então tanto a base antiga (git) quanto o bo3-2026.json atualizado
// dão o mesmo mapa — os novatos (legados ajustados a partir dos atributos) ficam fora.
export function loadLegacy(base: { id: string; players: Legacy[] }[], stats: StatsFile & { meta: { playerResolve?: Record<string, unknown> } }): Map<string, Legacy> {
  const curated = new Set(Object.keys(stats.meta.playerResolve ?? {}));
  return new Map(base.flatMap((t) => t.players.filter((p) => curated.has(p.id)).map((p) => [p.id, p] as const)));
}

export function serialize(x: Record<string, AttrsOut>): string {
  const keys = Object.keys(x).sort();
  const lines = keys.map((k, i) => `  ${JSON.stringify(k)}: ${JSON.stringify(x[k])}${i < keys.length - 1 ? ',' : ''}`);
  return '{\n' + lines.join('\n') + '\n}\n';
}

async function main() {
  const stats = JSON.parse(readFileSync(STATS_FILE, 'utf8')) as StatsFile;
  const legacy = loadLegacy(JSON.parse(readFileSync('src/data/bo3-2026.json', 'utf8')), stats);
  const out = buildAllAttrs(stats, legacy);
  writeFileSync(OUT_FILE, serialize(out));
  const cas = Object.values(out).map((x) => x.ca).sort((a, b) => a - b);
  console.log(`[attrs] ${OUT_FILE}: ${cas.length} jogadores; CA p10=${cas[Math.floor(cas.length * 0.1)]} p50=${cas[Math.floor(cas.length / 2)]} p90=${cas[Math.floor(cas.length * 0.9)]} max=${cas[cas.length - 1]}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
