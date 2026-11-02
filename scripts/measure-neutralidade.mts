// NEUTRALIDADE DA FASE 2 (integração) — quem nunca mexe em treino, tática e
// comissão tem que ganhar o MESMO que antes da fase 2 (±2 pp).
//
// Temporada modelo da Carreira: 3 splits × 3 etapas × 4 séries MD3; folga de
// 16 entre etapas e de 40 no fim do split (os mesmos valores de recoverCondition
// / recoverFatigue da Carreira). Seu time = um time real (ids user__), o
// adversário = um time de força parecida (±6); mapas sorteados.
//
//   ANTES  (base 51ed95f): fadiga antiga (9/série) → forma (applyFatigueForm); sem tática.
//   DEPOIS (fase 2):       agenda padrão normal → condição (fitness/ritmo) no duelo,
//                          lesão (reserva genérico), familiaridade que sobe/decai,
//                          tática padrão do usuário × tática da IA (scouting + vazamento).
//
//   npx tsx scripts/measure-neutralidade.mts [temporadas=40] [--json]

import { simulateSeries } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId, type TTeam } from '../src/types.ts';
import { realTeams } from './calibrate-engine.mts';
import { updateMatchFatigue } from '../src/engine/career/fatigue.ts';
import {
  defaultTrainingState, runTrainingWeek, recoverCondition, conditionWithFatigue, closeTrainingSplit, defaultCondition, leakAgainst,
} from '../src/engine/gestao/treino.ts';
import { applyConditionToTeam, substituteInjured, conditionDuelMod, isInjured } from '../src/engine/gestao/condicao.ts';
import { aiTactics, defaultTactics, tacticsAfterMatch, matchTacticsFor, autoAntiStratReadiness } from '../src/engine/gestao/tatica.ts';
import { scoutingOf } from '../src/engine/career/teamIdentity.ts';
import type { PlayerCondition, TacticsState, TrainingState } from '../src/engine/gestao/model.ts';

const SPLITS = 3, EVENTS = 3, SERIES = 4;

// forma pela fadiga ANTIGA (engine/career/fatigue.ts em 51ed95f)
function oldFatigueForm(team: TTeam, fatigue: Record<string, number>): TTeam {
  return {
    ...team,
    players: team.players.map((p) => {
      const load = fatigue[p.id.replace(/^user__/, '')] ?? 0;
      const pen = Math.max(0, load - 30) * 0.00145;
      return { ...p, form: Math.max(0.88, Math.min(1.12, (p.form ?? 1) * (1 - pen))) };
    }),
  };
}

export interface NeutralResult { series: number; before: number; after: number; diff: number; se: number; avgCondMod: number; avgFit: number; avgSharp: number; injuredShare: number }

export interface Parts { cond: boolean; injury: boolean; tactics: boolean }
export function measureNeutrality(seasons = 40, seed = 777, parts: Parts = { cond: true, injury: true, tactics: true }): NeutralResult {
  const all = realTeams().sort((a, b) => b.strength - a.strength).slice(0, 60);
  let wB = 0, wA = 0, n = 0, dd = 0, dd2 = 0;
  let condSum = 0, condN = 0, fitSum = 0, sharpSum = 0, injured = 0, slots = 0;
  for (let s = 0; s < seasons; s++) {
    const base = all[(s * 7) % all.length];
    const user: TTeam = { ...base, id: 'user', isUser: true, players: base.players.map((p) => ({ ...p, id: `user__${p.id}` })) };
    const ids = base.players.map((p) => p.id);
    const opps = all.filter((t) => t.id !== base.id && Math.abs(t.strength - base.strength) <= 6);
    // estado ANTES
    let fatigue: Record<string, number> = {};
    // estado DEPOIS
    let training: TrainingState = defaultTrainingState();
    let condition: Record<string, PlayerCondition> = Object.fromEntries(ids.map((id) => [id, defaultCondition()]));
    let tactics: TacticsState = defaultTactics();
    let k = 0;
    for (let sp = 1; sp <= SPLITS; sp++) {
      for (let ev = 0; ev < EVENTS; ev++) {
        for (let se = 0; se < SERIES; se++, k++) {
          const opp = opps[(s * 13 + k * 5) % opps.length];
          const maps = [0, 1, 2].map((i) => ({ map: MAP_POOL[(s * 3 + k * 2 + i * 3) % 7] as MapId, pickedBy: -1 as const }));
          const rs = (Math.imul(seed + s * 1000 + k, 2654435761) >>> 0);
          // ANTES
          const before = simulateSeries(makeRng(rs), oldFatigueForm(user, fatigue), opp, maps, 3);
          // DEPOIS
          const injuredIds = new Set(parts.injury ? ids.filter((id) => isInjured(condition[id])) : []);
          const utac = parts.tactics ? matchTacticsFor(tactics, 'disciplined', opp.id, autoAntiStratReadiness(scoutingOf(user))).tactics : null;
          const withCond = parts.cond ? applyConditionToTeam({ ...user, tactics: utac }, condition) : oldFatigueForm({ ...user, tactics: utac }, fatigue);
          const u = substituteInjured(withCond, injuredIds, []).team;
          const leak = leakAgainst(training, opp.id);
          const o = parts.tactics ? { ...opp, tactics: aiTactics(opp, { id: 'user', scouting: scoutingOf(opp), leak }) } : opp;
          const after = simulateSeries(makeRng(rs), u, o, maps, 3);
          for (const p of u.players) if (p.cond) { condSum += conditionDuelMod(p.cond); condN++; fitSum += p.cond.fitness; sharpSum += p.cond.sharpness; }
          injured += injuredIds.size; slots += 5;
          const b = before.winner === 0 ? 1 : 0, a = after.winner === 0 ? 1 : 0;
          wB += b; wA += a; n++; dd += a - b; dd2 += (a - b) ** 2;
          // fim de série — ANTES: fadiga antiga
          fatigue = updateMatchFatigue(fatigue, user.players, before.maps.length, [], {}).fatigue;
          // fim de série — DEPOIS: fadiga da série → semana de treino; tática
          const load = updateMatchFatigue(Object.fromEntries(ids.map((id) => [id, 100 - condition[id].fitness])), u.players.filter((p) => ids.includes(p.id.replace(/^user__/, ''))), after.maps.length, [], {});
          tactics = tacticsAfterMatch(tactics, after.maps.map((m) => m.map), opp.id);
          const played: Record<string, number> = {};
          for (const p of u.players) { const id = p.id.replace(/^user__/, ''); if (ids.includes(id)) played[id] = after.maps.length; }
          const wk = runTrainingWeek({
            training, condition: conditionWithFatigue(condition, load.fatigue), tactics,
            players: base.players.map((p) => ({ id: p.id, nick: p.nick })), maps: played, split: s * 10 + sp,
            leakTargets: opps.map((t) => t.id),
          });
          training = wk.training; condition = wk.condition; tactics = wk.tactics;
        }
        if (ev < EVENTS - 1) {
          fatigue = Object.fromEntries(Object.entries(fatigue).map(([id, v]) => [id, Math.max(0, v - 16)]));
          condition = recoverCondition(condition, 16);
        }
      }
      fatigue = Object.fromEntries(Object.entries(fatigue).map(([id, v]) => [id, Math.max(0, v - 40)]));
      condition = recoverCondition(condition, 40);
      training = closeTrainingSplit(training);
    }
  }
  const mean = dd / n;
  return {
    series: n, before: wB / n, after: wA / n, diff: mean, se: Math.sqrt((dd2 / n - mean * mean) / n),
    avgCondMod: condSum / condN, avgFit: fitSum / condN, avgSharp: sharpSum / condN, injuredShare: injured / slots,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 40);
  const only = process.argv.find((a) => a.startsWith('--parts='))?.slice(8);
  const parts = only ? { cond: only.includes('cond'), injury: only.includes('injury'), tactics: only.includes('tactics') } : undefined;
  const r = measureNeutrality(n, 777, parts);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    console.log(`${r.series} séries MD3 (${n} temporadas de ${SPLITS}×${EVENTS}×${SERIES})`);
    console.log(`vitória ANTES da fase 2: ${pct(r.before)}   DEPOIS: ${pct(r.after)}   diferença ${(r.diff * 100).toFixed(1)} pp ± ${(r.se * 100).toFixed(1)}`);
    console.log(`condição na partida: fitness médio ${r.avgFit.toFixed(1)}, ritmo médio ${r.avgSharp.toFixed(1)}, efeito médio ${r.avgCondMod.toFixed(3)} pt de atributo; lesionados ${(r.injuredShare * 100).toFixed(1)}% das vagas`);
  }
}
