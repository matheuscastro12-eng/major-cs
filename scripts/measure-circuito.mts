// MEDIÇÃO DO CIRCUITO REAL (fase 4 · frente J).
//
//   1. Distribuição do VRS novo por posição × a régua antiga (vrsCore + rolante):
//      patrocínios e prestígio leem os mesmos números, então as faixas têm que
//      bater (a curva de pontos do vrs.ts foi calibrada aqui).
//   2. Mundo vivo: rotatividade do top 10, correlação força × ranking.
//   3. Tempo do avanço: simular a etapa inteira em segundo plano + publicar o
//      VRS (o que roda ao fechar cada etapa) e o Major completo.
//   4. Progressão (neutralidade da carreira): um time do usuário de força X
//      começando no Tier 3 — em quantos splits chega ao Tier 1 e ao Major, no
//      VRS ANTIGO (rolante + base do elenco) × no NOVO (resultados do mundo).
//
//   npx tsx scripts/measure-circuito.mts [splits=12] [--json]

import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { buildAiWorld } from '../src/engine/career/aiWorld.ts';
import { teamSeasonToTTeam } from '../src/engine/ratings.ts';
import { hashStr } from '../src/state/hash.ts';
import {
  buildEtapaEvents, etapaTime, isMajorSplit, EVENTS_PER_SPLIT, majorTime,
} from '../src/engine/mundo/circuito.ts';
import {
  seedWorld, simulateEtapaWorld, closeWorld, majorFieldFromVrs, majorResults, majorRouteOf, eventResult, USER_ID,
} from '../src/engine/mundo/mundoCarreira.ts';
import { completeMajor, quickGslEvent, seedRng, withEventForm } from '../src/engine/mundo/mundoSim.ts';
import type { MundoState } from '../src/engine/mundo/model.ts';
import type { TeamSeason } from '../src/types.ts';

export function aiPool(split = 1): TeamSeason[] {
  return buildAiWorld({ base: CS2_REAL_2026, moves: {}, split, skip: new Set(), takeoverId: null, extraOnTeam: {}, aiDrift: {}, arrivals: {} } as never)
    .filter((t) => !t.defunct && t.players.length >= 5);
}
export function strengthMap(pool: TeamSeason[]): Map<string, number> {
  return new Map(pool.map((t) => [t.id, teamSeasonToTTeam(t).strength]));
}

// régua ANTIGA (CareerScreen até a fase 3): núcleo pelo entrosamento + jitter + rolante
const CAREER_VRS_DECAY = 0.6;
const core = (tw: number) => Math.max(0, tw - 61) * 25 + Math.pow(Math.max(0, tw - 82), 2) * 10;
function aiSplitGain(id: string, c: number, split: number) {
  const roll = (hashStr(`${id}|vrs|${split}`) % 1000) / 1000;
  const st = Math.max(0, Math.min(1, c / 900));
  return Math.round((0.15 + 0.85 * (roll * 0.55 + st * 0.45)) * (60 + st * 120));
}
function oldAiVrs(t: TeamSeason, split: number) {
  const c = core(t.teamwork);
  let tot = 0;
  for (let k = 0; k < 5; k++) { const p = split - k; if (p < 1) break; tot += Math.pow(CAREER_VRS_DECAY, k) * aiSplitGain(t.id, c, p); }
  return Math.round(c + (hashStr(t.id) % 55)) + Math.round(tot);
}

export interface WorldRun { mundo: MundoState; msPerEtapa: number; msMajor: number; top10: string[][]; corr: number }

/** Roda o mundo `splits` splits pra frente a partir do split 1 (todo mundo em segundo plano). */
export function runWorld(splits: number, pool = aiPool(1)): WorldRun {
  const str = strengthMap(pool);
  const sOf = (id: string) => str.get(id) ?? 70;
  const seeded = seedWorld({ pool, strengthOf: sOf, now: 0 });
  let mundo: MundoState = { v: 1, calendar: [], results: seeded.results, vrs: seeded.vrs, newgens: {}, intake: [], databaseId: null, vrsAt: seeded.vrsAt };
  let etMs = 0, etN = 0, mjMs = 0, mjN = 0;
  const top10: string[][] = [];
  for (let split = 1; split <= splits; split++) {
    for (let etapa = 1; etapa <= EVENTS_PER_SPLIT; etapa++) {
      const t0 = performance.now();
      const events = buildEtapaEvents(pool, split, etapa, mundo.vrs);
      const res = simulateEtapaWorld(events, split, etapa, sOf);
      mundo = closeWorld(mundo, res, etapaTime(split, etapa)).mundo;
      etMs += performance.now() - t0; etN++;
    }
    if (isMajorSplit(split)) {
      const t0 = performance.now();
      const plan = majorFieldFromVrs(mundo.vrs, pool, null);
      mundo = closeWorld(mundo, majorResults(split, completeMajor(plan, sOf, `m:${split}`)), majorTime(split)).mundo;
      mjMs += performance.now() - t0; mjN++;
    }
    top10.push(Object.values(mundo.vrs).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 10).map((e) => e.teamId));
  }
  // correlação de Spearman força × posição no ranking
  const ranked = Object.values(mundo.vrs).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map((e) => e.teamId).filter((id) => str.has(id));
  const byStr = [...ranked].sort((a, b) => sOf(b) - sOf(a));
  const n = ranked.length;
  const d2 = ranked.reduce((acc, id, i) => acc + (i - byStr.indexOf(id)) ** 2, 0);
  const corr = 1 - (6 * d2) / (n * (n * n - 1));
  return { mundo, msPerEtapa: etMs / Math.max(1, etN), msMajor: mjMs / Math.max(1, mjN), top10, corr };
}

// ─── progressão do usuário: antigo × novo ──────────────────────────────────
const VRS_BY_POS = [150, 105, 75, 52, 36, 26, 18, 11];
const TIER1 = 32, TIER2 = 64;
interface Prog { toT2: number; toT1: number; majors: number; finalTier: number }
/** Um time de força `s` (TTeam.strength) começando no Tier 3: splits até subir e Majors disputados. */
export function progression(s: number, splits: number, pool: TeamSeason[], mode: 'old' | 'new', seed = 1): Prog {
  const str = strengthMap(pool);
  const sOf = (id: string) => (id === USER_ID ? s : str.get(id) ?? 70);
  let tier = 3, oldVrs = 0;
  let mundo: MundoState | null = null;
  if (mode === 'new') {
    const seeded = seedWorld({ pool, strengthOf: sOf, now: 0 });
    mundo = { v: 1, calendar: [], results: seeded.results, vrs: seeded.vrs, newgens: {}, intake: [], databaseId: null };
  }
  const out: Prog = { toT2: 0, toT1: 0, majors: 0, finalTier: 3 };
  const userTw = 90; // elenco montado pelo usuário: buildUserTeam dá ~90 de entrosamento (medido)
  for (let split = 1; split <= splits; split++) {
    let rankNow = 999;
    for (let etapa = 1; etapa <= EVENTS_PER_SPLIT; etapa++) {
      const events = buildEtapaEvents(pool, split, etapa, mode === 'new' ? mundo!.vrs : null);
      const slot = tier === 1 ? 't1' : tier === 2 ? 't2' : 't3';
      const ev = events.find((e) => e.slot === slot)!;
      // o usuário entra no evento do seu tier (16 times, como na Carreira) — liga de verdade pelo modelo
      const rng = seedRng(`prog:${seed}:${split}:${etapa}:${s}`);
      const teams = withEventForm(rng, [{ id: USER_ID, s }, ...ev.teams.map((t) => ({ id: t.id, s: sOf(t.id) + 1.5 }))]);
      const r = quickGslEvent(rng, teams);
      const mine = r.placements.find((p) => p.teamId === USER_ID)!.place;
      if (mode === 'old') {
        const pos = mine === 1 ? 1 : mine === 2 ? 2 : mine === 3 ? 3 : mine === 5 ? 5 : mine === 9 ? 5 : 7;
        const poMult = mine === 1 ? 1.6 : mine === 2 ? 1.25 : 1;
        oldVrs = Math.round(oldVrs * CAREER_VRS_DECAY) + Math.round((VRS_BY_POS[pos - 1] ?? 10) * ev.vrsWeight * poMult);
        const userTotal = Math.round(Math.max(0, userTw - 60) * 14) + oldVrs;
        rankNow = pool.filter((t) => oldAiVrs(t, split) > userTotal).length + 1;
      } else {
        const bg = simulateEtapaWorld(events, split, etapa, sOf, new Set([ev.id]));
        const mineRes = eventResult({ id: ev.id, name: ev.name, tier: ev.tier, kind: 'gsl', lan: ev.lan, prize: ev.prize, split, t: etapaTime(split, etapa) }, r.placements);
        mundo = closeWorld(mundo!, [...bg, mineRes], etapaTime(split, etapa)).mundo;
        rankNow = mundo.vrs[USER_ID]?.rank ?? 999;
      }
    }
    if (isMajorSplit(split)) {
      if (mode === 'old') { if (rankNow <= 32) out.majors++; }
      else {
        const plan = majorFieldFromVrs(mundo!.vrs, pool, { region: 'europe' });
        const route = majorRouteOf(plan);
        const w = completeMajor(plan, sOf, `p:${seed}:${split}`);
        const inMajor = w.major.some((p) => p.teamId === USER_ID);
        if (route.kind !== 'out' && inMajor) out.majors++;
        mundo = closeWorld(mundo!, majorResults(split, w), majorTime(split)).mundo;
        rankNow = mundo.vrs[USER_ID]?.rank ?? 999;
      }
    }
    const byRank = rankNow <= TIER1 ? 1 : rankNow <= TIER2 ? 2 : 3;
    if (byRank < tier) tier--; else if (byRank > tier) tier++;
    if (tier <= 2 && !out.toT2) out.toT2 = split;
    if (tier === 1 && !out.toT1) out.toT1 = split;
  }
  out.finalTier = tier;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const splits = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 12);
  const pool = aiPool(1);
  const w = runWorld(splits, pool);
  const newPts = Object.values(w.mundo.vrs).sort((a, b) => b.points - a.points).map((e) => e.points);
  const oldPts = pool.map((t) => oldAiVrs(t, splits)).sort((a, b) => b - a);
  const ranks = [1, 4, 8, 16, 24, 32, 48, 64, 80, 100];
  console.log('VRS por posição (antigo → novo):', ranks.map((r) => `#${r} ${oldPts[r - 1] ?? '-'}→${newPts[r - 1] ?? '-'}`).join('  '));
  console.log('ranqueados:', newPts.length, '· correlação força×ranking (Spearman):', w.corr.toFixed(3));
  const turnover = w.top10.slice(1).map((t, i) => t.filter((id) => !w.top10[i].includes(id)).length);
  const leaders = new Set(w.top10.map((t) => t[0]));
  console.log('top 10: trocas por split', turnover.join(','), '· líderes diferentes:', leaders.size);
  console.log(`tempo: etapa em segundo plano + VRS ${w.msPerEtapa.toFixed(2)} ms · Major completo ${w.msMajor.toFixed(2)} ms`);
  console.log('tamanho no save: results', JSON.stringify(w.mundo.results).length, 'B · vrs', JSON.stringify(w.mundo.vrs).length, 'B');
  for (const s of [80, 84, 88]) {
    const agg = (mode: 'old' | 'new') => {
      const rs = [1, 2, 3, 4, 5, 6].map((seed) => progression(s, splits, pool, mode, seed));
      const avg = (k: keyof Prog) => (rs.reduce((a, r) => a + (r[k] || splits + 1), 0) / rs.length).toFixed(1);
      return `T2 no split ${avg('toT2')} · T1 no split ${avg('toT1')} · Majors ${(rs.reduce((a, r) => a + r.majors, 0) / rs.length).toFixed(1)}`;
    };
    console.log(`força ${s}: antigo [${agg('old')}]  novo [${agg('new')}]`);
  }
}
