// MEDIÇÃO DO ESTILO DE JOGO — quanto cada estilo move a vitória, por perfil de elenco.
//
// Espelho: o MESMO elenco (perfil modificado) contra um clone de si mesmo com o
// estilo Padrão; os dois com a tática da IA (papéis naturais, plano do mapa) e a
// familiaridade de estilo fixa. Só o estilo do lado A muda.
//
//   npx tsx scripts/measure-estilo.mts [mapas=2000] [--json]
//
// Perfis: o elenco real (médio) e quatro formas — mira de entrada, cabeça
// (leitura/IGL), frieza (pós-plant/clutch/retake) e coletivo (troca/utilitária).

import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId, type TTeam, type TPlayer } from '../src/types.ts';
import { attrsOf, legacyFromA } from '../src/engine/attrs/model.ts';
import type { AttrKey } from '../src/engine/attributes.ts';
import { aiTactics } from '../src/engine/gestao/tatica.ts';
import { styleKey, styleProfile, styleFitPp, STYLES_CT, STYLES_T } from '../src/engine/gestao/estilo.ts';
import type { StyleId, TeamStyle } from '../src/engine/gestao/model.ts';
import { tierSTeams } from './calibrate-engine.mts';

export type ProfileId = 'medio' | 'mira' | 'cabeca' | 'frieza' | 'coletivo';
export const PROFILES: Record<ProfileId, Partial<Record<AttrKey, number>>> = {
  medio: {},
  mira: { aimMovement: 2.5, reaction: 2.5, preAim: 2, reflexes: 1.5, gameSense: -2, positioning: -1.5, anticipation: -2, leadership: -1.5, composure: -1.5 },
  cabeca: { gameSense: 2.5, decisions: 2, anticipation: 2, leadership: 2.5, communication: 1.5, vision: 2, coordination: 1.5, aimMovement: -2.5, reaction: -2, preAim: -2 },
  frieza: { composure: 2.5, clutch: 2.5, positioning: 2, discipline: 2, offAngles: 1.5, concentration: 1.5, aimMovement: -2, preAim: -2, teamwork: -2, coordination: -1.5 },
  coletivo: { teamwork: 2.5, communication: 2.5, coordination: 2.5, apm: 2, vision: 2, reaction: 1, clutch: -2, composure: -2, positioning: -1.5, anticipation: -1.5 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function reshape(team: TTeam, prof: ProfileId): TTeam {
  const d = PROFILES[prof];
  if (!Object.keys(d).length) return team;
  const scale = Number(process.env.PROFILE_SCALE ?? 0.35);
  return {
    ...team,
    players: team.players.map((p): TPlayer => {
      const x = attrsOf(p);
      const a = { ...x.a };
      for (const [k, v] of Object.entries(d)) a[k as AttrKey] = clamp(a[k as AttrKey] + v * scale, 1, 20);
      const l = legacyFromA(a);
      return { ...p, ...l, attrs: { ...x, a } };
    }),
  };
}

const clone = (t: TTeam, tag: string): TTeam => ({ ...t, id: `${tag}-${t.id}`, isUser: false, players: t.players.map((p) => ({ ...p, id: `${tag}-${p.id}` })) });

const withStyle = (t: TTeam, style: TeamStyle, fam = 70): TTeam => {
  const base = aiTactics(t);
  const styleFam: Record<string, number> = {};
  for (const s of STYLES_T) styleFam[styleKey('t', s)] = fam;
  for (const s of STYLES_CT) styleFam[styleKey('ct', s)] = fam;
  return { ...t, tactics: { ...base, style, styleFam } };
};

export interface StyleRun { mapWinA: number; roundWinA: number; se: number; openA: number; tradesA: number; retakesA: number; plantsA: number }

/** A (estilo) × B (Padrão), mesmo elenco/perfil. */
export function mirrorStyle(prof: ProfileId, styleA: TeamStyle, nMaps = 2000, seed = 777, styleB: TeamStyle = { t: 'standard', ct: 'standard' }, fam = 70): StyleRun {
  const teams = tierSTeams().map((t) => reshape(t, prof));
  let winA = 0, rA = 0, rT = 0, open = 0, trades = 0, retakes = 0, plants = 0, tR = 0, ctR = 0, ctPl = 0;
  for (let m = 0; m < nMaps; m++) {
    const base = teams[m % teams.length];
    const map = MAP_POOL[Math.floor(m / teams.length) % MAP_POOL.length] as MapId;
    const A = withStyle(clone(base, 'a'), styleA, fam);
    const B = withStyle(clone(base, 'b'), styleB, fam);
    const sim = createMapSimV2(makeRng((seed ^ Math.imul(m + 1, 0x9e3779b1)) >>> 0), A, B, map, -1);
    while (!sim.step()) { /* joga */ }
    const [a, b] = sim.score();
    if (a > b) winA++;
    rA += a; rT += a + b;
    const ss = sim.result().styleStats!;
    open += ss[0].openWon; trades += ss[0].trades; retakes += ss[0].retakes; plants += ss[0].plants;
    tR += ss[0].tRounds; ctR += ss[0].ctRounds; ctPl += ss[0].ctPlantsAgainst;
  }
  const p = winA / nMaps;
  return { mapWinA: p, roundWinA: rA / rT, se: Math.sqrt((p * (1 - p)) / nMaps), openA: open / rT, tradesA: trades / rT, retakesA: ctPl ? retakes / ctPl : 0, plantsA: tR ? plants / tR : 0 };
}

/** MD3 a partir da vitória de mapa (mapas independentes). */
export const bo3 = (p: number) => p * p * (3 - 2 * p);

if (process.argv[1]?.endsWith('measure-estilo.mts')) {
  const n = Number(process.argv[2] ?? 2000);
  const json = process.argv.includes('--json');
  const out: Record<string, Record<string, StyleRun>> = {};
  const profs = (process.env.PROFS?.split(',') ?? Object.keys(PROFILES)) as ProfileId[];
  for (const prof of profs) {
    out[prof] = {};
    const P = styleProfile(reshape(tierSTeams()[0], prof).players);
    if (!json) console.log(`\n== ${prof} ==  perfil`, Object.fromEntries(Object.entries(P).map(([k, v]) => [k, Math.round(v * 100) / 100])));
    const cells: [string, TeamStyle, 't' | 'ct', StyleId][] = [
      ...STYLES_T.filter((s) => s !== 'standard').map((s) => [`T:${s}`, { t: s, ct: 'standard' }, 't', s] as [string, TeamStyle, 't', StyleId]),
      ...STYLES_CT.filter((s) => s !== 'standard').map((s) => [`CT:${s}`, { t: 'standard', ct: s }, 'ct', s] as [string, TeamStyle, 'ct', StyleId]),
    ];
    for (const [name, st, side, s] of cells) {
      const r = mirrorStyle(prof, st, n);
      out[prof][name] = r;
      const est = styleFitPp(side, s, styleProfile(reshape(tierSTeams()[0], prof).players)) / 2;
      if (!json) console.log(`${name.padEnd(14)} mapa ${(r.mapWinA * 100).toFixed(1)}% ±${(r.se * 100).toFixed(1)} · round ${(r.roundWinA * 100).toFixed(2)}% · est ${est.toFixed(2)}pp · open ${(r.openA * 100).toFixed(1)} trades/r ${r.tradesA.toFixed(2)} retake ${(r.retakesA * 100).toFixed(1)} plant ${(r.plantsA * 100).toFixed(1)}`);
    }
  }
  if (json) console.log(JSON.stringify(out));
  else {
    console.log('\nresumo (T e CT somados; MD3 de mapas independentes):');
    for (const prof of profs) {
      const best = (side: string) => Object.entries(out[prof]).filter(([k]) => k.startsWith(side)).reduce((b, [k, r]) => (r.mapWinA > b[1] ? [k, r.mapWinA] : b), ['std', 0.5] as [string, number]);
      const worst = (side: string) => Object.entries(out[prof]).filter(([k]) => k.startsWith(side)).reduce((b, [k, r]) => (r.mapWinA < b[1] ? [k, r.mapWinA] : b), ['std', 0.5] as [string, number]);
      const bT = best('T:'), bC = best('CT:'), wT = worst('T:'), wC = worst('CT:');
      const pb = 0.5 + (bT[1] - 0.5) + (bC[1] - 0.5), pw = 0.5 + (wT[1] - 0.5) + (wC[1] - 0.5);
      console.log(`${prof.padEnd(9)} melhor ${bT[0]}+${bC[0]} mapa ${(pb * 100).toFixed(1)} MD3 ${(bo3(pb) * 100).toFixed(1)} · pior ${wT[0]}+${wC[0]} mapa ${(pw * 100).toFixed(1)} MD3 ${(bo3(pw) * 100).toFixed(1)} · Δ MD3 ${((bo3(pb) - bo3(pw)) * 100).toFixed(1)} pp`);
    }
  }
}
