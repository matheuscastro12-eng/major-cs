// Probabilidade por jogo (time A x B) com o motor do jogo: autoVeto + simulateSeries
// (o mesmo corpo de simulateAiSeries em src/engine/swiss.ts, sem pressão), com os elencos
// da lista do Major (src/data/major-singapore-2026.json, stand-ins incluídos).
//
//   npm run stats:prob-jogo -- --a FURIA --b paiN [--n 5000] [--seed 20261124]
//   npm run stats:prob-jogo -- --brs                 # BRs da lista x (BRs + 10 mais fortes da lista)
//   npm run stats:prob-jogo -- --a MIBR --b Vitality --json
// Opções: --out-dir /workspace/major-cs/stats (com --brs grava prob-jogo-brs-<status>.json/.csv)
//
// Viés de veto: metade das N séries roda com A como "time 1" no veto e metade com B (resultado
// mapeado de volta), pra ordem de ban/pick não favorecer ninguém. Seed fixa → resultado reprodutível.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TTeam } from '../../src/types.ts';
import { buildField } from '../../src/engine/majorSingapore/index.ts';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../../src/engine/majorSingapore/data.ts';
import { makeRng } from '../../src/engine/rng.ts';
import { autoVeto } from '../../src/engine/veto.ts';
import { simulateSeries } from '../../src/engine/match.ts';

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const N = Number(arg('n', '5000'));
const SEED = Number(arg('seed', '20261124'));
const BR_TAGS = ['FURIA', 'paiN', 'MIBR', 'Legacy', 'Imperial', 'FUT', 'RED Canids'];

const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const find = (q: string): TTeam => {
  const hit = field.all.find((t) => norm(t.name) === norm(q) || norm(t.tag) === norm(q));
  if (!hit) throw new Error(`time "${q}" não está na lista do Major. Disponíveis: ${field.all.map((t) => t.name).join(', ')}`);
  return hit;
};

export interface Matchup {
  a: string; b: string; n: number; seed: number;
  bo1: { pA: number; pB: number };
  bo3: { pA: number; pB: number; scores: Record<string, number> };
  bo5: { pA: number; pB: number; scores: Record<string, number> };
  mapWinPctA: number;
}
const r1 = (x: number) => Math.round(x * 1000) / 10;

function simulate(a: TTeam, b: TTeam, bo: 1 | 3 | 5, n: number, seed: number) {
  const rng = makeRng(seed);
  let winsA = 0; const scores: Record<string, number> = {}; let mapsA = 0, maps = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1; // alterna quem é o "time 1" do veto
    const [t1, t2] = swap ? [b, a] : [a, b];
    const mapsV = autoVeto([t1, t2], rng, bo);
    const r = simulateSeries(rng, t1, t2, mapsV, bo);
    const aWon = (r.winner === 0) !== swap;
    const [sa, sb] = swap ? [r.mapScore[1], r.mapScore[0]] : r.mapScore;
    if (aWon) winsA++;
    scores[`${sa}-${sb}`] = (scores[`${sa}-${sb}`] ?? 0) + 1;
    mapsA += sa; maps += sa + sb;
  }
  return { p: winsA / n, scores, mapRate: maps ? mapsA / maps : 0.5 };
}

export function matchup(a: TTeam, b: TTeam, n = N, seed = SEED): Matchup {
  const k = (s: string) => seed + [...s].reduce((x, c) => x + c.charCodeAt(0), 0);
  const o1 = simulate(a, b, 1, n, k(`1${a.id}${b.id}`));
  const o3 = simulate(a, b, 3, n, k(`3${a.id}${b.id}`));
  const o5 = simulate(a, b, 5, n, k(`5${a.id}${b.id}`));
  const sc = (s: Record<string, number>) => Object.fromEntries(Object.entries(s).sort((x, y) => y[1] - x[1]).map(([kk, v]) => [kk, r1(v / n)]));
  return {
    a: a.name, b: b.name, n, seed,
    bo1: { pA: r1(o1.p), pB: Math.round((100 - r1(o1.p)) * 10) / 10 },
    bo3: { pA: r1(o3.p), pB: Math.round((100 - r1(o3.p)) * 10) / 10, scores: sc(o3.scores) },
    bo5: { pA: r1(o5.p), pB: Math.round((100 - r1(o5.p)) * 10) / 10, scores: sc(o5.scores) },
    mapWinPctA: r1(o3.mapRate),
  };
}

const show = (m: Matchup) => `${m.a} x ${m.b}  (${m.n} séries/formato, seed ${m.seed})
  Bo1: ${m.a} ${m.bo1.pA}% · ${m.b} ${m.bo1.pB}%
  Bo3: ${m.a} ${m.bo3.pA}% · ${m.b} ${m.bo3.pB}%   placares: ${Object.entries(m.bo3.scores).map(([s, v]) => `${s} ${v}%`).join(', ')}
  Bo5: ${m.a} ${m.bo5.pA}% · ${m.b} ${m.bo5.pB}%   placares: ${Object.entries(m.bo5.scores).map(([s, v]) => `${s} ${v}%`).join(', ')}`;

if (flag('brs')) {
  const brs = BR_TAGS.map((q) => { try { return find(q); } catch { return null; } }).filter((t): t is TTeam => !!t);
  const status = /oficial/i.test(MAJOR_SG_CONFIG.listStatus) && !/provis|n[ãa]o/i.test(MAJOR_SG_CONFIG.listStatus) ? 'OFICIAL' : 'PROVISORIO';
  const rows: Matchup[] = [];
  const seen = new Set<string>();
  // oponentes: os próprios BRs + os 10 times mais fortes da lista (use --a/--b pra qualquer outro jogo)
  const top10 = [...field.all].sort((x, y) => y.strength - x.strength).slice(0, 10);
  const opps = [...new Map([...brs, ...top10].map((t) => [t.id, t])).values()];
  for (const br of brs) for (const o of opps) {
    if (o.id === br.id) continue;
    const key = [br.id, o.id].sort().join('|');
    if (seen.has(key)) continue; seen.add(key);
    rows.push(matchup(br, o));
  }
  const outDir = resolve(arg('out-dir', '/workspace/major-cs/stats')!);
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `prob-jogo-brs-${status}-${N}`);
  writeFileSync(`${base}.json`, JSON.stringify({ status, listStatus: MAJOR_SG_CONFIG.listStatus, listUpdatedAt: MAJOR_SG_CONFIG.updatedAt, n: N, seed: SEED, brsNaLista: brs.map((t) => t.name), matchups: rows }, null, 1) + '\n');
  writeFileSync(`${base}.csv`, ['status,time_a,time_b,n,bo1_a_pct,bo1_b_pct,bo3_a_pct,bo3_b_pct,bo5_a_pct,bo5_b_pct,mapa_a_pct'].concat(rows.map((m) => [status, `"${m.a}"`, `"${m.b}"`, m.n, m.bo1.pA, m.bo1.pB, m.bo3.pA, m.bo3.pB, m.bo5.pA, m.bo5.pB, m.mapWinPctA].join(','))).join('\n') + '\n');
  console.log(`[${status}] BRs na lista: ${brs.map((t) => t.name).join(', ')} · ${rows.length} confrontos`);
  console.log(`Arquivos: ${base}.json / .csv`);
} else if (arg('a') && arg('b')) {
  const m = matchup(find(arg('a')!), find(arg('b')!));
  console.log(flag('json') ? JSON.stringify(m, null, 1) : show(m));
} else {
  console.error('Uso: npm run stats:prob-jogo -- --a FURIA --b paiN [--n 5000] [--seed 20261124] [--json]\n     npm run stats:prob-jogo -- --brs');
  process.exit(1);
}
