// HARNESS DE CALIBRAÇÃO DO MOTOR v2 (duelos) — realismo FM, fase 1.
//
// Simula milhares de mapas entre os times reais da base (CS2 2026, atributos
// via attrsOf) e compara as distribuições com docs/calibration-targets.json:
// CT% por mapa, conversão do pistol, eco/force contra full, 5v4/4v5, clutch
// 1v1/1v2, rating/ADR/KAST por função, opening do Entry e share do AWPer.
// Também mede ms por mapa e a curva força→vitória contra o v1 (a régua de
// balanceamento dos modos: mudar de motor não pode mudar a dificuldade).
//
//   npx tsx scripts/calibrate-engine.mts [mapas=4000] [seed=20260929] [--json]
//
// O teste scripts/test-engine-calibration.mts roda o mesmo harness (amostra
// menor, seed fixa) e falha quando algum alvo sai da tolerância.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { teamSeasonToTTeam } from '../src/engine/ratings.ts';
import { computeDisplay, simulateSeries, setMatchEngine, type MatchEngine } from '../src/engine/match.ts';
import { createMapSimV2, type RoundTrace } from '../src/engine/match2/engine.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId, type PlayerLine, type Role, type TTeam } from '../src/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TARGETS_PATH = join(HERE, '..', 'docs', 'calibration-targets.json');

export interface Target { value: number; tol: number; unit?: string; def?: string; source?: string; provisional?: boolean; estimate?: boolean; by?: Record<string, { value: number; tol: number }> }
export interface TargetsFile { version: number; provisional?: boolean; targets: Record<string, Target> }

export function loadTargets(path = TARGETS_PATH): TargetsFile {
  return JSON.parse(readFileSync(path, 'utf8')) as TargetsFile;
}

export interface Metrics {
  maps: number;
  rounds: number;
  msPerMap: number;
  ctRoundWin: { all: number; by: Record<string, number> };
  pistolConversion: number;
  ecoWin: number;
  forceWin: number;
  openingConversion: number;
  clutch1v1: number;
  clutch1v2: number;
  ratingRelByRole: { all: number; by: Record<string, number> };
  ratingAbsByRole: Record<string, number>;
  adr: { all: number; by: Record<string, number> };
  kast: { all: number; by: Record<string, number> };
  entryOpeningShare: number;
  awpKillShare: number;
  kpr: number;
  endMix: Record<string, number>;
  samples: Record<string, number>;
}

const ratio = (a: number, b: number) => (b ? a / b : NaN);

// times DISPUTÁVEIS da base (sem extintos nem os virtuais __free__/__retired__)
export function realTeams(): TTeam[] {
  return CS2_REAL_2026.filter((t) => !t.defunct && !t.id.startsWith('__')).map(teamSeasonToTTeam).filter((t) => t.players.length === 5);
}

// Os alvos reais vêm de uma amostra TIER S (docs/calibration-targets.json →
// sample); o harness joga entre os TIER_S_TEAMS mais fortes da base.
export const TIER_S_TEAMS = 40;
export function tierSTeams(): TTeam[] {
  return realTeams().sort((a, b) => b.strength - a.strength).slice(0, TIER_S_TEAMS);
}

export function runCalibration(nMaps = 4000, seed = 20260929): Metrics {
  const teams = tierSTeams();
  const rng = makeRng(seed);
  const ctW: Record<string, [number, number]> = {};
  let pistolWon = 0, pistolConv = 0;
  let ecoN = 0, ecoW = 0, forceN = 0, forceW = 0;
  let openN = 0, openW = 0;
  const cl: Record<number, [number, number]> = { 1: [0, 0], 2: [0, 0] };
  const byRole: Record<string, { rating: number; n: number; dmg: number; kast: number; rounds: number }> = {};
  let allRating = 0, allN = 0, allDmg = 0, allKast = 0, allRounds = 0, allKills = 0;
  let entryOpen = 0, teamOpenE = 0, awpKills = 0, teamKillsA = 0;
  let rounds = 0;
  const ends: Record<string, number> = {};
  let ms = 0;

  for (let m = 0; m < nMaps; m++) {
    const i = Math.floor(rng() * teams.length);
    let j = Math.floor(rng() * (teams.length - 1));
    if (j >= i) j++;
    const map = MAP_POOL[m % MAP_POOL.length] as MapId;
    const t0 = performance.now();
    const sim = createMapSimV2(makeRng((seed ^ Math.imul(m + 1, 0x9e3779b1)) >>> 0), teams[i], teams[j], map, -1);
    while (!sim.step()) { /* joga o mapa */ }
    ms += performance.now() - t0;
    const tr: RoundTrace[] = sim.trace();
    rounds += tr.length;
    ctW[map] ??= [0, 0];
    for (let r = 0; r < tr.length; r++) {
      const x = tr[r];
      ends[x.end] = (ends[x.end] ?? 0) + 1;
      const ctTeam: 0 | 1 = x.aSide === 'ct' ? 0 : 1;
      ctW[map][1]++;
      if (x.winner === ctTeam) ctW[map][0]++;
      if ((x.round === 0 || x.round === 12) && tr[r + 1]) {
        pistolWon++;
        if (tr[r + 1].winner === x.winner) pistolConv++;
      }
      // eco/force × full pelo NÍVEL DE EQUIPAMENTO do round (como o bo3.gg mede o
      // alvo: economy_level -1/0 contra 2), não pela faixa de caixa
      if (x.round !== 0 && x.round !== 12) {
        for (const [ti, oi] of [[0, 1], [1, 0]] as const) {
          if (x.econ[oi] !== 2) continue;
          if (x.econ[ti] === -1) { ecoN++; if (x.winner === ti) ecoW++; }
          if (x.econ[ti] === 0) { forceN++; if (x.winner === ti) forceW++; }
        }
      }
      if (x.openingTeam >= 0) { openN++; if (x.winner === x.openingTeam) openW++; }
      for (const ti of [0, 1] as const) {
        const c = x.clutch[ti];
        if (c && (c.vs === 1 || c.vs === 2)) { cl[c.vs][1]++; if (x.winner === ti) cl[c.vs][0]++; }
      }
    }
    const stats = sim.stats();
    for (const team of [teams[i], teams[j]]) {
      let teamOpen = 0, teamKills = 0;
      for (const p of team.players) teamOpen += stats[p.id].both.openKills, teamKills += stats[p.id].both.kills;
      const entry = team.players.find((p) => p.role === 'Entry');
      if (entry) { entryOpen += stats[entry.id].both.openKills; teamOpenE += teamOpen; }
      const awper = team.players.find((p) => p.role === 'AWP');
      if (awper) { awpKills += stats[awper.id].both.kills; teamKillsA += teamKills; }
      for (const p of team.players) {
        const line: PlayerLine = stats[p.id].both;
        const d = computeDisplay(line);
        const role: Role = p.role;
        byRole[role] ??= { rating: 0, n: 0, dmg: 0, kast: 0, rounds: 0 };
        const b = byRole[role];
        b.rating += d.rating; b.n++; b.dmg += line.dmg; b.kast += line.kastRounds; b.rounds += line.rounds;
        allRating += d.rating; allN++; allDmg += line.dmg; allKast += line.kastRounds; allRounds += line.rounds; allKills += line.kills;
      }
    }
  }
  const meanRating = allRating / allN;
  const ctBy: Record<string, number> = {};
  let ctAllW = 0, ctAllN = 0;
  for (const [k, [w, n]] of Object.entries(ctW)) { ctBy[k] = w / n; ctAllW += w; ctAllN += n; }
  const relBy: Record<string, number> = {}, absBy: Record<string, number> = {}, adrBy: Record<string, number> = {}, kastBy: Record<string, number> = {};
  for (const [r, b] of Object.entries(byRole)) {
    absBy[r] = b.rating / b.n;
    relBy[r] = absBy[r] / meanRating;
    adrBy[r] = b.dmg / b.rounds;
    kastBy[r] = b.kast / b.rounds;
  }
  return {
    maps: nMaps,
    rounds,
    msPerMap: ms / nMaps,
    ctRoundWin: { all: ctAllW / ctAllN, by: ctBy },
    pistolConversion: ratio(pistolConv, pistolWon),
    ecoWin: ratio(ecoW, ecoN),
    forceWin: ratio(forceW, forceN),
    openingConversion: ratio(openW, openN),
    clutch1v1: ratio(cl[1][0], cl[1][1]),
    clutch1v2: ratio(cl[2][0], cl[2][1]),
    ratingRelByRole: { all: 1, by: relBy },
    ratingAbsByRole: absBy,
    adr: { all: allDmg / allRounds, by: adrBy },
    kast: { all: allKast / allRounds, by: kastBy },
    entryOpeningShare: ratio(entryOpen, teamOpenE),
    awpKillShare: ratio(awpKills, teamKillsA),
    kpr: allKills / allRounds,
    endMix: Object.fromEntries(Object.entries(ends).map(([k, v]) => [k, Math.round((v / rounds) * 1000) / 1000])),
    samples: { pistol: pistolWon, eco: ecoN, force: forceN, opening: openN, clutch1v1: cl[1][1], clutch1v2: cl[2][1] },
  };
}

export interface Check { key: string; target: number; tol: number; got: number; ok: boolean; provisional: boolean }

export function compareTargets(m: Metrics, tf: TargetsFile = loadTargets()): Check[] {
  const out: Check[] = [];
  const push = (key: string, t: { value: number; tol: number }, got: number, prov: boolean) =>
    out.push({ key, target: t.value, tol: t.tol, got, ok: Number.isFinite(got) && Math.abs(got - t.value) <= t.tol, provisional: prov });
  for (const [key, t] of Object.entries(tf.targets)) {
    const prov = !!(t.provisional ?? tf.provisional);
    const v = (m as unknown as Record<string, unknown>)[key];
    if (typeof v === 'number') push(key, t, v, prov);
    else if (v && typeof v === 'object' && 'by' in v) {
      const o = v as { all: number; by: Record<string, number> };
      if (key !== 'ratingRelByRole') push(key, t, o.all, prov);
      for (const [k, sub] of Object.entries(t.by ?? {})) if (k in o.by) push(`${key}.${k}`, sub, o.by[k], prov);
    }
  }
  return out;
}

// Curva força→vitória (BO3): time-base clonado, só a força do time varia. A
// mesma régua de sim/balance.ts. Serve pra comparar v1 × v2.
export function strengthCurve(engine: MatchEngine, gaps = [0, 4, 8, 14], n = 600): Record<number, number> {
  setMatchEngine(engine);
  try {
    const teams = realTeams().sort((x, y) => y.strength - x.strength);
    const base = teams[Math.floor(teams.length / 2)];
    const maps = MAP_POOL.map((m) => ({ map: m as MapId, pickedBy: -1 as const }));
    const out: Record<number, number> = {};
    let seed = 1;
    for (const gap of gaps) {
      const a: TTeam = { ...base, id: 'strong', strength: base.strength + gap, players: base.players.map((p) => ({ ...p, id: `s-${p.id}` })) };
      const b: TTeam = { ...base, id: 'weak', players: base.players.map((p) => ({ ...p, id: `w-${p.id}` })) };
      let w = 0;
      for (let k = 0; k < n; k++) if (simulateSeries(makeRng(Math.imul(seed++, 2654435761) >>> 0), a, b, maps, 3).winner === 0) w++;
      out[gap] = w / n;
    }
    return out;
  } finally {
    setMatchEngine(null);
  }
}

const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
const fmt = (c: Check) => (c.key.startsWith('adr') ? c.got.toFixed(1) : c.key.startsWith('ratingRel') ? c.got.toFixed(3) : pct(c.got));
const fmtT = (c: Check) => (c.key.startsWith('adr') ? `${c.target} ± ${c.tol}` : c.key.startsWith('ratingRel') ? `${c.target.toFixed(2)} ± ${c.tol}` : `${pct(c.target)} ± ${(c.tol * 100).toFixed(1)}`);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const n = Number(args[0] ?? 4000);
  const seed = Number(args[1] ?? 20260929);
  const m = runCalibration(n, seed);
  const checks = compareTargets(m);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ metrics: m, checks }, null, 2));
  } else {
    console.log(`motor v2 — ${m.maps} mapas, ${m.rounds} rounds, ${m.msPerMap.toFixed(3)} ms/mapa`);
    console.log('alvo'.padEnd(26), 'alvo'.padEnd(16), 'obtido'.padEnd(10), 'ok');
    for (const c of checks) console.log(c.key.padEnd(26), fmtT(c).padEnd(16), fmt(c).padEnd(10), c.ok ? 'ok' : 'FORA', c.provisional ? '(provisório)' : '');
    console.log('rating absoluto por função:', Object.entries(m.ratingAbsByRole).map(([k, v]) => `${k} ${v.toFixed(3)}`).join('  '));
    console.log('KPR médio:', m.kpr.toFixed(3), ' fim de round:', JSON.stringify(m.endMix), ' amostras:', JSON.stringify(m.samples));
    const v1 = strengthCurve('v1');
    const v2 = strengthCurve('v2');
    console.log('curva força→vitória BO3 (gap: v1 / v2):', Object.keys(v1).map((g) => `+${g}: ${pct(v1[+g])} / ${pct(v2[+g])}`).join('  '));
  }
}
