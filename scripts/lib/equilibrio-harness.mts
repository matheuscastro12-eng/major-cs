// [equilíbrio] Harness da partida da Carreira fora do React: monta os dois lados
// como o CareerScreen (buildTeam/syncUser/prepareTeams) usando as MESMAS contas
// de engine/career/equilibrio.ts. Usado por scripts/test-equilibrio.mts e pelas
// medições (o "espelho": o mesmo elenco como seu time × como time da IA).
import { CS2_REAL_2026 } from '../../src/data/bo3.ts';
import type { Coach, Difficulty, TeamSeason, TTeam } from '../../src/types.ts';
import { buildUserTeam, orgRefSynergy, teamSeasonToTTeam } from '../../src/engine/ratings.ts';
import { simulateSeries } from '../../src/engine/match.ts';
import { makeRng } from '../../src/engine/rng.ts';
import { autoVeto } from '../../src/engine/veto.ts';
import { buildAiWorld } from '../../src/engine/career/aiWorld.ts';
import { aiStaffEdgeFor } from '../../src/engine/gestao/staffData.ts';
import { aiTactics, matchTacticsFor, defaultTactics, autoAntiStratReadiness } from '../../src/engine/gestao/tatica.ts';
import { scoutingOf } from '../../src/engine/career/teamIdentity.ts';
import { applyConditionToTeam } from '../../src/engine/gestao/condicao.ts';
import { defaultCondition } from '../../src/engine/gestao/treino.ts';
import { setStyle } from '../../src/engine/gestao/estilo.ts';
import { PLAN_STYLE, applyGamePlan, careerAiTeam, careerUserTeam, takeoverTeamwork, type CareerGamePlan } from '../../src/engine/career/equilibrio.ts';

export type Plan = CareerGamePlan | 'none';

export const world1: TeamSeason[] = buildAiWorld({ base: CS2_REAL_2026, split: 1, skip: new Set() })
  .filter((t) => !t.defunct && t.players.length >= 5 && !t.id.startsWith('__'));
export const ranked: TeamSeason[] = world1
  .map((t) => ({ t, s: teamSeasonToTTeam(t).strength }))
  .sort((a, b) => b.s - a.s)
  .map((x) => x.t);
/** Amostra do espelho: do topo do mundo ao meio da tabela. */
export const MIRROR_RANKS = [0, 2, 5, 10, 20, 30, 45, 60];

const formOne = (t: TTeam): TTeam => ({ ...t, players: t.players.map((p) => ({ ...p, form: 1 })) });

/** Seu time por TAKEOVER intacto (régua única, entrosamento real da org). */
export function takeoverUser(org: TeamSeason, coach: Coach = org.coach): TTeam {
  const built = buildUserTeam(org.team, org.players.slice(0, 5).map((p) => ({ player: p, from: org })), coach, org.teamwork, orgRefSynergy(org));
  return formOne(careerUserTeam(built, takeoverTeamwork(org.teamwork, 0, []), coach));
}

/** syncUser + prepareTeams do lado do usuário: plano de jogo, tática e condição padrão. */
export function prepUser(u: TTeam, oppId: string, plan: Plan = 'disciplined'): TTeam {
  const st = plan === 'none' ? null : PLAN_STYLE[plan];
  const mt = matchTacticsFor(st ? setStyle(defaultTactics(), st) : defaultTactics(), plan === 'none' ? 'disciplined' : plan, oppId, autoAntiStratReadiness(scoutingOf(u)));
  const planned = plan === 'none' ? u : applyGamePlan(u, plan);
  const cond = Object.fromEntries(u.players.map((p) => [p.id.replace(/^user__/, ''), defaultCondition()]));
  return applyConditionToTeam({ ...planned, tactics: mt.tactics }, cond);
}

/** Time da IA numa partida sua: régua única + comissão + vantagem do modo (null = sem vantagem nenhuma). */
export function aiFor(org: TeamSeason, mode: Difficulty | null, userId = 'user'): TTeam {
  const base = teamSeasonToTTeam(org);
  const ai = mode ? careerAiTeam(base, mode, aiStaffEdgeFor(org)) : { ...base, noEdge: true };
  return { ...ai, tactics: aiTactics(ai, { id: userId, scouting: scoutingOf(ai), leak: 0 }) };
}

/** 1 = `a` venceu a série. */
export function series(a: TTeam, b: TTeam, seed: number, bo: 1 | 3 = 3): number {
  const rng = makeRng(seed >>> 0);
  const r = simulateSeries(rng, a, b, autoVeto([a, b], rng, bo), bo);
  return r.winner === 0 ? 1 : 0;
}

/** Vitória do usuário (lados alternados) em n séries. */
export function winRate(u: TTeam, a: TTeam, n: number, seed0: number): number {
  let w = 0;
  for (let k = 0; k < n; k++) {
    const s = seed0 + k * 7919;
    w += k % 2 === 0 ? series(u, a, s) : 1 - series(a, u, s);
  }
  return w / n;
}

/** ESPELHO: cada elenco da amostra como seu time (takeover) × como time da IA. */
export function mirror(mode: Difficulty | null, plan: Plan, n: number, coachOf?: (t: TeamSeason) => Coach): number {
  let tot = 0;
  for (const i of MIRROR_RANKS) {
    const t = ranked[i];
    const u = prepUser(takeoverUser(t, coachOf ? coachOf(t) : t.coach), t.id, plan);
    tot += winRate(u, aiFor(t, mode), n, 777 + i);
  }
  return tot / MIRROR_RANKS.length;
}
