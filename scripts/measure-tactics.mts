// MEDIÇÃO DA TÁTICA POR MAPA (fase 2) — quanto uma tática boa move a vitória.
//
// Espelho: o MESMO time (elenco, força, técnico) contra um clone de si mesmo;
// só a tática muda. Mede vitória de mapa e de round do lado A ao longo de
// milhares de mapas (times tier S da base, mapas do pool em rodízio).
//
//   npx tsx scripts/measure-tactics.mts [mapas=3000] [--json]
//
// Os números vão para docs/realismo-fm-fase2.md (tabela de efeitos medidos).

import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId, type TTeam } from '../src/types.ts';
import { tierSTeams } from './calibrate-engine.mts';
import {
  aiTactics, blankMapTactic, bestSetupVs, bestExecVs, NATURAL_MAP_ROLE, MAP_ROLES,
} from '../src/engine/gestao/tatica.ts';
import type { MapTactic, TacticsState, TeamInstructions } from '../src/engine/gestao/model.ts';

export type Variant = (team: TTeam, map: MapId, opp: TTeam) => TacticsState | null;

const clone = (t: TTeam, tag: string): TTeam => ({ ...t, id: `${tag}-${t.id}`, isUser: false, players: t.players.map((p) => ({ ...p, id: `${tag}-${p.id}` })) });

export interface MirrorResult { maps: number; mapWinA: number; roundWinA: number; ctRound: number; se: number }

/** A (variante) × B (base), mesmo elenco. */
export function mirror(varA: Variant, varB: Variant, nMaps = 3000, seed = 4242): MirrorResult {
  const teams = tierSTeams();
  let winA = 0, rA = 0, rT = 0, ctW = 0;
  for (let m = 0; m < nMaps; m++) {
    const base = teams[m % teams.length];
    const map = MAP_POOL[Math.floor(m / teams.length) % MAP_POOL.length] as MapId;
    const A0 = clone(base, 'a'), B0 = clone(base, 'b');
    const A = { ...A0, tactics: varA(A0, map, B0) };
    const B = { ...B0, tactics: varB(B0, map, A0) };
    const sim = createMapSimV2(makeRng((seed ^ Math.imul(m + 1, 0x9e3779b1)) >>> 0), A, B, map, -1);
    while (!sim.step()) { /* joga */ }
    const [a, b] = sim.score();
    if (a > b) winA++;
    rA += a; rT += a + b;
    for (const x of sim.trace()) if (x.winner === (x.aSide === 'ct' ? 0 : 1)) ctW++;
  }
  const p = winA / nMaps;
  return { maps: nMaps, mapWinA: p, roundWinA: rA / rT, ctRound: ctW / rT, se: Math.sqrt((p * (1 - p)) / nMaps) };
}

// ── variantes ────────────────────────────────────────────────────────────────

const withMap = (base: TacticsState, map: MapId, patch: Partial<MapTactic>): TacticsState => ({
  ...base, maps: { ...base.maps, [map]: { ...(base.maps[map] ?? blankMapTactic(map)), ...patch } },
});

/** Tática padrão da IA (a que a Carreira dá aos adversários). */
export const ai: Variant = (t) => aiTactics(t);
/** Plano padrão de quem nunca mexeu (papéis naturais, setup padrão, default/split). */
export const userDefault: Variant = () => ({ v: 1, instr: aiTactics({ id: 'x', players: [], coach: { nick: '', name: '', country: '', rating: 75, style: 'tactical' } }).instr, maps: {}, antiStrat: null });
export const fam = (f: number): Variant => (t, map) => withMap(aiTactics(t), map, { familiarity: f });
export const instr = (patch: Partial<TeamInstructions>): Variant => (t) => { const x = aiTactics(t); return { ...x, instr: { ...x.instr, ...patch } }; };

/** Papéis embaralhados: rotação dos papéis naturais (ninguém no seu). */
export const shuffledRoles: Variant = (t, map) => {
  const base = aiTactics(t);
  const nat = t.players.map((p) => base.maps[map]?.roles[p.id] ?? NATURAL_MAP_ROLE[p.role]);
  const roles: Record<string, (typeof MAP_ROLES)[number]> = {};
  t.players.forEach((p, i) => { roles[p.id] = nat[(i + 2) % nat.length]; });
  return withMap(base, map, { roles });
};
/** Só o AWP e o IGL trocados de papel (erro "clássico"). */
export const swapAwpIgl: Variant = (t, map) => {
  const base = aiTactics(t);
  const roles = { ...(base.maps[map]?.roles ?? {}) };
  const awp = t.players.find((p) => roles[p.id] === 'awp');
  const igl = t.players.find((p) => roles[p.id] === 'igl');
  if (awp && igl) { roles[awp.id] = 'igl'; roles[igl.id] = 'awp'; }
  return withMap(base, map, { roles });
};

/** CT fixo × T fixo (A joga só esse setup e só essa execução; B idem). */
export const plan = (ct: MapTactic['ct'], t: MapTactic['t'], f = 50): Variant => (team, map) => withMap(aiTactics(team), map, { ct, t, familiarity: f });

/** Anti-strat: A estuda B (prontidão r) e joga a própria tática da IA. */
export const anti = (readiness: number): Variant => (t, _map, opp) => ({ ...aiTactics(t), antiStrat: { opponentTeamId: opp.id, readiness } });

// ── relatório ────────────────────────────────────────────────────────────────

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 3000);
  const rows: [string, MirrorResult][] = [];
  const run = (label: string, a: Variant, b: Variant) => { const r = mirror(a, b, n); rows.push([label, r]); console.log(label.padEnd(58), 'mapa A', pct(r.mapWinA).padStart(6), `±${(r.se * 100).toFixed(1)}`, ' round A', pct(r.roundWinA), ' CT', pct(r.ctRound)); };
  run('sanidade: sem tática × sem tática', () => null, () => null);
  run('sanidade: IA × IA (espelho)', ai, ai);
  run('CT%: utilitária pesada nos dois', instr({ utility: 'heavy' }), instr({ utility: 'heavy' }));
  run('CT%: utilitária equilibrada nos dois', instr({ utility: 'balanced' }), instr({ utility: 'balanced' }));
  run('familiaridade 90 × 20', fam(90), fam(20));
  run('familiaridade 80 × 50', fam(80), fam(50));
  run('familiaridade 50 × 20', fam(50), fam(20));
  run('papéis naturais × embaralhados', ai, shuffledRoles);
  run('papéis naturais × AWP↔IGL trocados', ai, swapAwpIgl);
  // RPS: A fixa stack no A e só rush A (previsível); B responde com o contra ideal
  const bestCt = bestSetupVs(['fastA']);
  const bestT = bestExecVs('stackA');
  run(`plano contra ideal (B: ${bestCt}/${bestT}) × A stackA/fastA`, plan(bestCt, [bestT]), plan('stackA', ['fastA']));
  run('setup/execução balanceados × previsível (stackA/fastA)', plan('standard', ['default', 'splitA', 'splitB']), plan('stackA', ['fastA']));
  run('anti-strat 100 × 0 (IA × IA)', anti(100), ai);
  run('anti-strat 50 × 0', anti(50), ai);
  run('anti-strat 100 × previsível (stackA/fastA)', anti(100), plan('stackA', ['fastA']));
  run('anti-strat 0 × previsível (stackA/fastA)', ai, plan('stackA', ['fastA']));
  run('tática boa × ruim (fam 85 + papéis + variado × fam 25 + embaralhado + previsível)', plan('standard', ['default', 'splitA', 'splitB'], 85), (t, map, o) => {
    const x = shuffledRoles(t, map, o)!;
    return withMap(x, map, { ct: 'stackA', t: ['fastA'], familiarity: 25 });
  });
  run('eco: sempre forçar × padrão', instr({ ecoPolicy: 'alwaysForce' }), instr({ ecoPolicy: 'forceAfterPistol' }));
  run('eco: save total × padrão', instr({ ecoPolicy: 'fullSave' }), instr({ ecoPolicy: 'forceAfterPistol' }));
  run('ritmo rápido × equilibrado', instr({ tempo: 'fast' }), instr({ tempo: 'balanced' }));
  run('ritmo lento × equilibrado', instr({ tempo: 'slow' }), instr({ tempo: 'balanced' }));
  run('agressiva × equilibrada', instr({ aggression: 'aggressive' }), instr({ aggression: 'balanced' }));
  run('passiva × equilibrada', instr({ aggression: 'passive' }), instr({ aggression: 'balanced' }));
  run('utilitária pesada × equilibrada', instr({ utility: 'heavy' }), instr({ utility: 'balanced' }));
  run('timeout cedo × tarde', instr({ timeoutPolicy: 'early' }), instr({ timeoutPolicy: 'late' }));
  run('plano padrão (quem nunca mexeu) × IA', userDefault, ai);
  if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(rows), null, 2));
}
