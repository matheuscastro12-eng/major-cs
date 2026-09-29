// EQUILÍBRIO DO MUNDO — fase 3 · IA de mercado.
//
// Simula N splits do mundo da Carreira SEM o usuário e compara o mercado antigo
// (tickAIMarketActivity: 1 movimento de upgrade por split) com o novo
// (engine/clube/mercadoIA.ts: orçamento, estratégia, necessidades, janela de
// pré-temporada + janela curta no meio do split, cadeias e stand-ins).
//
// Os dois lados usam o MESMO mundo (engine/career/aiWorld.ts — o pipeline do
// currentEra da Carreira: moves → chegadas → envelhecimento/aposentadoria com
// jovens da base → drift de força) e a MESMA régua de forma: o resultado do
// clube no split sai da força do elenco contra o nível do seu tier (quem montou
// time acima do tier ganha mais, sobe o drift, sobe de tier e ganha mais caixa)
// — é o laço que produziria superequipes se o mercado deixasse.
//
// Mede, split a split: OVR médio do top 20 (média top-5 do elenco), força por
// tier (tier pelo teamwork com drift), o melhor elenco, quantos elencos ≥ 86
// (superequipe), o fosso top 5 × 21º-40º e o mercado livre.
//
//   npx tsx scripts/measure-mercado-equilibrio.mts [splits=10] [--json]

import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { TeamSeason } from '../src/types.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import {
  buildAiWorld, agedFreeAgents, nextAiDrift, aiAgeOf, baseOvrOf, BASE_PLAYER_IDS, currentFreeAgents,
} from '../src/engine/career/aiWorld.ts';
import { tickAIMarketActivity } from '../src/engine/career/transferAI.ts';
import { computeAllTeamForms, type TeamFormSave } from '../src/engine/career/teamForm.ts';
import { tickMarketWindow, squadOvr, aiTierOf, type WindowKind } from '../src/engine/clube/mercadoIA.ts';
import type { MarketLoan } from '../src/engine/clube/model.ts';
import type { League } from '../src/engine/league.ts';

const BASE = CS2_REAL_2026;
const NO_SKIP = new Set<string>();

export interface SplitMetrics {
  split: number;
  top20: number;        // OVR médio (top-5 do elenco) dos 20 melhores elencos
  top5: number;
  mid: number;          // 21º-40º
  best: number;         // melhor elenco
  superteams: number;   // elencos com top-5 ≥ 86
  tier: Record<1 | 2 | 3, { n: number; ovr: number }>;
  free: number;         // tamanho do mercado livre
  freeTop10: number;    // OVR médio dos 10 melhores livres
  moves: number;        // movimentos na(s) janela(s) que fecharam este split
  windows: { kind: WindowKind | "old"; moves: number; chains: number; standIns: number; gaps?: number }[];
}

// regressão linear força do elenco × teamwork no mundo inicial: o "nível do tier"
function fitExpected(world: TeamSeason[]): (tw: number) => number {
  const xs = world.map((t) => t.teamwork), ys = world.map((t) => squadOvr(t.players));
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return (tw) => my + b * (tw - mx);
}

// resultado do split (proxy): força do elenco acima do nível do tier ⇒ ganha mais
function resultsSave(world: TeamSeason[], split: number, aiDrift: Record<string, number>, expected: (tw: number) => number): TeamFormSave {
  const teams = world.map((t) => {
    const wr = Math.max(0.1, Math.min(0.9, 0.5 + (squadOvr(t.players) - expected(t.teamwork)) * 0.045));
    return { id: t.id, wins: Math.round(wr * 10), losses: 10 - Math.round(wr * 10) };
  });
  return { split, aiDrift, league: { teams } as unknown as League };
}

function metrics(world: TeamSeason[], free: { id: string; aim: number }[], split: number): Omit<SplitMetrics, 'moves' | 'windows'> {
  const strengths = world.map((t) => ({ t, s: squadOvr(t.players) })).sort((a, b) => b.s - a.s);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const tier = { 1: { n: 0, ovr: 0 }, 2: { n: 0, ovr: 0 }, 3: { n: 0, ovr: 0 } } as SplitMetrics['tier'];
  for (const { t, s } of strengths) { const k = aiTierOf(t); tier[k].n++; tier[k].ovr += s; }
  for (const k of [1, 2, 3] as const) tier[k].ovr = tier[k].n ? tier[k].ovr / tier[k].n : 0;
  const freeOvr = (free as never as Parameters<typeof playerOvr>[0][]).map(playerOvr).sort((a, b) => b - a);
  return {
    split,
    top20: avg(strengths.slice(0, 20).map((x) => x.s)),
    top5: avg(strengths.slice(0, 5).map((x) => x.s)),
    mid: avg(strengths.slice(20, 40).map((x) => x.s)),
    best: strengths[0]?.s ?? 0,
    superteams: strengths.filter((x) => x.s >= 86).length,
    tier,
    free: free.length,
    freeTop10: avg(freeOvr.slice(0, 10)),
  };
}

export function simulateWorld(mode: 'before' | 'after', splits = 10): SplitMetrics[] {
  let moves: Record<string, string> = {};
  let aiDrift: Record<string, number> = {};
  let arrivals: Record<string, number> = {};
  let loans: MarketLoan[] = [];
  let budgets: Record<string, number> | undefined;
  const expected = fitExpected(buildAiWorld({ base: BASE, split: 1, skip: NO_SKIP }));
  const out: SplitMetrics[] = [];
  for (let s = 1; s <= splits + 1; s++) {
    const world = () => buildAiWorld({ base: BASE, moves, split: s, skip: NO_SKIP, aiDrift, arrivals });
    const w0 = world();
    const m = metrics(w0, agedFreeAgents(BASE, moves, s, NO_SKIP), s);
    if (s === splits + 1) { out.push({ ...m, moves: 0, windows: [] }); break; }
    const windows: SplitMetrics['windows'] = [];
    if (mode === 'before') {
      const save = resultsSave(w0, s, aiDrift, expected);
      const tick = tickAIMarketActivity({ save, split: s, teams: w0, freeAgents: currentFreeAgents(BASE, moves), movableIds: BASE_PLAYER_IDS });
      moves = { ...moves, ...tick.moves };
      windows.push({ kind: 'old', moves: tick.log.length, chains: 0, standIns: 0 });
      aiDrift = nextAiDrift(w0.map((t) => t.id), computeAllTeamForms(save), s, aiDrift);
    } else {
      // janela curta do meio do split (depois da etapa 1)
      const midSave = resultsSave(w0, s, aiDrift, expected);
      const midForms = computeAllTeamForms(midSave);
      const mid = tickMarketWindow({
        teams: w0, freeAgents: agedFreeAgents(BASE, moves, s, NO_SKIP), split: s, kind: 'mid',
        formOf: (id) => midForms[id] ?? 50, ageOf: (p) => aiAgeOf(p, s), baseOvrOf, movableIds: BASE_PLAYER_IDS,
        budgets, loans,
      });
      moves = { ...moves, ...mid.moves }; arrivals = { ...arrivals, ...mid.arrivals }; loans = mid.loans;
      windows.push({ kind: "mid", moves: mid.log.length, chains: mid.chains, standIns: mid.standIns, gaps: mid.chainGaps });
      // fechamento do split: forma do split inteiro, drift e janela de pré-temporada
      const w1 = world();
      const save = resultsSave(w1, s, aiDrift, expected);
      const forms = computeAllTeamForms(save);
      const off = tickMarketWindow({
        teams: w1, freeAgents: agedFreeAgents(BASE, moves, s, NO_SKIP), split: s + 1, kind: 'offseason',
        formOf: (id) => forms[id] ?? 50, ageOf: (p) => aiAgeOf(p, s), baseOvrOf, movableIds: BASE_PLAYER_IDS,
        loans,
      });
      moves = { ...moves, ...off.moves }; arrivals = { ...arrivals, ...off.arrivals }; loans = off.loans; budgets = off.budgets;
      windows.push({ kind: "offseason", moves: off.log.length, chains: off.chains, standIns: off.standIns, gaps: off.chainGaps });
      aiDrift = nextAiDrift(w1.map((t) => t.id), forms, s, aiDrift);
    }
    out.push({ ...m, moves: windows.reduce((a, w) => a + w.moves, 0), windows });
  }
  return out;
}

const f1 = (v: number) => v.toFixed(1);
export function equilibriumTable(before: SplitMetrics[], after: SplitMetrics[]): string {
  const rows = [
    '| split | top 20 antes | top 20 depois | top 5 antes | top 5 depois | 21º-40º antes | 21º-40º depois | melhor antes | melhor depois | ≥86 antes | ≥86 depois | T1/T2/T3 antes | T1/T2/T3 depois | livres (top10) antes | livres (top10) depois | movimentos antes | movimentos depois |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (let i = 0; i < before.length; i++) {
    const b = before[i], a = after[i];
    const tiers = (m: SplitMetrics) => `${f1(m.tier[1].ovr)} (${m.tier[1].n}) / ${f1(m.tier[2].ovr)} (${m.tier[2].n}) / ${f1(m.tier[3].ovr)} (${m.tier[3].n})`;
    rows.push(`| ${b.split} | ${f1(b.top20)} | ${f1(a.top20)} | ${f1(b.top5)} | ${f1(a.top5)} | ${f1(b.mid)} | ${f1(a.mid)} | ${f1(b.best)} | ${f1(a.best)} | ${b.superteams} | ${a.superteams} | ${tiers(b)} | ${tiers(a)} | ${b.free} (${f1(b.freeTop10)}) | ${a.free} (${f1(a.freeTop10)}) | ${b.moves} | ${a.moves} |`);
  }
  return rows.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv.slice(2).find((x) => !x.startsWith('--')) ?? 10);
  const t0 = Date.now();
  const before = simulateWorld('before', n);
  const after = simulateWorld('after', n);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ before, after }, null, 2));
  else {
    console.log(`Mundo da Carreira sem o usuário, ${n} splits (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
    console.log(equilibriumTable(before, after));
    console.log('\nJanelas (depois):');
    for (const m of after.slice(0, -1)) console.log(`  split ${m.split}: ${m.windows.map((w) => `${w.kind} ${w.moves} mov (${w.chains} em cadeia, ${w.standIns} stand-in, ${w.gaps ?? 0} sem reposição)`).join(' · ')}`);
  }
}
