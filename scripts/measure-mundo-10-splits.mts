// MUNDO EM 10 SPLITS — fase 4 · frente K (juventude e envelhecimento).
//
// Simula o mundo da Carreira SEM o usuário pelo MESMO pipeline da Carreira:
// base → save.moves → envelhecimento/aposentadoria da IA (engine/career/aiWorld.ts)
// → janelas do mercado da IA (curta no meio do split + pré-temporada,
// engine/clube/mercadoIA.ts) → drift de força → fechamento da juventude
// (engine/mundo/juventudeMundo.ts: aposentadorias, evolução e poda dos jovens,
// leva nova na virada do ano). A forma do clube no split sai da força do elenco
// contra o nível do tier (quem monta time acima do tier ganha mais) — o laço
// que produziria superequipes se o mercado deixasse.
//
// Mede split a split: OVR médio do top 20 (média top-5 dos 20 melhores
// elencos), top 5, 21º-40º, melhor elenco, elencos ≥ 86, renovação de nomes
// no top 20 (jogadores do top 20 que não estavam lá no split 1), jovens no
// mundo (total/contratados/titulares/no top 20), aposentados e o tamanho do
// bloco de jovens no save.
//
//   npx tsx scripts/measure-mundo-10-splits.mts [splits=10] [--no-youth] [--json]

import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { TeamSeason } from '../src/types.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import { buildAiWorld, agedFreeAgents, nextAiDrift, aiAgeOf, baseOvrOf } from '../src/engine/career/aiWorld.ts';
import { computeAllTeamForms, type TeamFormSave } from '../src/engine/career/teamForm.ts';
import { tickMarketWindow, squadOvr } from '../src/engine/clube/mercadoIA.ts';
import type { MarketLoan } from '../src/engine/clube/model.ts';
import type { League } from '../src/engine/league.ts';
import {
  EMPTY_MUNDO, ensureYearIntake, movableIdsWith, movesWithout, tickJuventude, withNewgens, youthAffinity,
} from '../src/engine/mundo/juventudeMundo.ts';
import { isNewgenId, newgenBytes, newgenList, type MundoJuv } from '../src/engine/mundo/juventude.ts';

const BASE = CS2_REAL_2026;
const NO_SKIP = new Set<string>();
const SAVE = { org: { name: 'Medição', tag: 'MED' }, split: 1, squad: [] };

export interface MundoSplit {
  split: number;
  top20: number; top5: number; mid: number; best: number; superteams: number;
  renewal: number;        // fração dos titulares do top 20 que não estavam no top 20 do split 1
  youngTop20: number;     // titulares do top 20 com ≤ 21 anos
  newgens: number; signed: number; starters: number; inTop20: number;
  retirees: number;       // aposentados do mundo no fechamento deste split
  bytes: number;          // bloco de jovens (newgens + atributos + gerações) no save
  free: number;
}

function fitExpected(world: TeamSeason[]): (tw: number) => number {
  const xs = world.map((t) => t.teamwork), ys = world.map((t) => squadOvr(t.players));
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return (tw) => my + b * (tw - mx);
}
function resultsSave(world: TeamSeason[], split: number, aiDrift: Record<string, number>, expected: (tw: number) => number): TeamFormSave {
  const teams = world.map((t) => {
    const wr = Math.max(0.1, Math.min(0.9, 0.5 + (squadOvr(t.players) - expected(t.teamwork)) * 0.045));
    return { id: t.id, wins: Math.round(wr * 10), losses: 10 - Math.round(wr * 10) };
  });
  return { split, aiDrift, league: { teams } as unknown as League };
}
const top5Ids = (t: TeamSeason) => [...t.players].sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 5).map((p) => p.id);

export function simulateMundo(splits = 10, opts: { youth?: boolean } = {}): { rows: MundoSplit[]; mundo: MundoJuv; moves: Record<string, string> } {
  const youth = opts.youth !== false;
  let moves: Record<string, string> = {};
  let aiDrift: Record<string, number> = {};
  let arrivals: Record<string, number> = {};
  let loans: MarketLoan[] = [];
  let budgets: Record<string, number> | undefined;
  let mundo: MundoJuv = EMPTY_MUNDO;
  const w1Base = buildAiWorld({ base: BASE, split: 1, skip: NO_SKIP });
  const expected = fitExpected(w1Base);
  if (youth) mundo = ensureYearIntake(mundo, { split: 1, save: SAVE, world: w1Base });
  const rows: MundoSplit[] = [];
  let firstTop20: Set<string> | null = null;
  let lastRetirees = 0;
  for (let s = 1; s <= splits + 1; s++) {
    const base = () => (youth ? withNewgens(BASE, mundo) : BASE);
    const world = () => buildAiWorld({ base: base(), moves, split: s, skip: NO_SKIP, aiDrift, arrivals });
    const w0 = world();
    const ranked = w0.map((t) => ({ t, s: squadOvr(t.players) })).sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, 20);
    const topIds = new Set(top.flatMap((x) => top5Ids(x.t)));
    if (!firstTop20) firstTop20 = topIds;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const ng = newgenList(mundo);
    const ngIds = new Set(ng.map((p) => p.id));
    const placed = new Map<string, number>();
    for (const t of w0) t.players.forEach((p, i) => { if (ngIds.has(p.id)) placed.set(p.id, i); });
    rows.push({
      split: s,
      top20: avg(top.map((x) => x.s)), top5: avg(ranked.slice(0, 5).map((x) => x.s)), mid: avg(ranked.slice(20, 40).map((x) => x.s)),
      best: ranked[0]?.s ?? 0, superteams: ranked.filter((x) => x.s >= 86).length,
      renewal: [...topIds].filter((id) => !firstTop20!.has(id)).length / Math.max(1, topIds.size),
      youngTop20: [...topIds].filter((id) => { const p = top.flatMap((x) => x.t.players).find((q) => q.id === id)!; return aiAgeOf(p, s) <= 21; }).length,
      newgens: ng.length, signed: placed.size, starters: [...placed.values()].filter((i) => i < 5).length,
      inTop20: [...topIds].filter((id) => isNewgenId(id)).length,
      retirees: lastRetirees,
      bytes: newgenBytes(mundo),
      free: agedFreeAgents(base(), moves, s, NO_SKIP).length,
    });
    if (s === splits + 1) break;
    const movable = youth ? movableIdsWith(mundo) : movableIdsWith(null);
    const affinity = youth ? youthAffinity(mundo) : undefined;
    // janela curta do meio do split
    const midForms = computeAllTeamForms(resultsSave(w0, s, aiDrift, expected));
    const mid = tickMarketWindow({
      teams: w0, freeAgents: agedFreeAgents(base(), moves, s, NO_SKIP), split: s, kind: 'mid',
      formOf: (id) => midForms[id] ?? 50, ageOf: (p) => aiAgeOf(p, s), baseOvrOf, movableIds: movable, affinity,
      budgets, loans, arrivals,
    });
    moves = { ...moves, ...mid.moves }; arrivals = { ...arrivals, ...mid.arrivals }; loans = mid.loans;
    // fechamento: forma do split, pré-temporada, drift
    const w1 = world();
    const forms = computeAllTeamForms(resultsSave(w1, s, aiDrift, expected));
    const off = tickMarketWindow({
      teams: w1, freeAgents: agedFreeAgents(base(), moves, s, NO_SKIP), split: s + 1, kind: 'offseason',
      formOf: (id) => forms[id] ?? 50, ageOf: (p) => aiAgeOf(p, s), baseOvrOf, movableIds: movable, affinity,
      loans, arrivals,
    });
    moves = { ...moves, ...off.moves }; arrivals = { ...arrivals, ...off.arrivals }; loans = off.loans; budgets = off.budgets;
    aiDrift = nextAiDrift(w1.map((t) => t.id), forms, s, aiDrift);
    // juventude do fechamento
    if (youth) {
      const r = tickJuventude({ mundo, split: s, base: BASE, moves, arrivals, aiDrift, skip: NO_SKIP, save: SAVE });
      mundo = r.mundo;
      moves = movesWithout(moves, r.removed) ?? moves;
      lastRetirees = r.retirees.length;
    }
  }
  return { rows, mundo, moves };
}

const f1 = (v: number) => v.toFixed(1);
export function mundoTable(rows: MundoSplit[]): string {
  const out = [
    '| split | top 20 | top 5 | 21º-40º | melhor | ≥86 | renovação top 20 | ≤21 no top 20 | jovens (contratados/titulares/top 20) | aposentados | livres | bloco jovens |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    out.push(`| ${r.split} | ${f1(r.top20)} | ${f1(r.top5)} | ${f1(r.mid)} | ${f1(r.best)} | ${r.superteams} | ${Math.round(r.renewal * 100)}% | ${r.youngTop20} | ${r.newgens} (${r.signed}/${r.starters}/${r.inTop20}) | ${r.retirees} | ${r.free} | ${(r.bytes / 1024).toFixed(1)} KB |`);
  }
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv.slice(2).find((x) => !x.startsWith('--')) ?? 10);
  const t0 = Date.now();
  const { rows, mundo } = simulateMundo(n, { youth: !process.argv.includes('--no-youth') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(`Mundo da Carreira sem o usuário, ${n} splits (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
    console.log(mundoTable(rows));
    const d = rows[rows.length - 1].top20 - rows[0].top20;
    console.log(`\ntop 20: ${f1(rows[0].top20)} → ${f1(rows[rows.length - 1].top20)} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`);
    console.log(`jovens vivos: ${Object.keys(mundo.newgens).length} · bloco no save: ${(newgenBytes(mundo) / 1024).toFixed(1)} KB · gerações: ${[...new Set(mundo.intake.map((l) => l.year))].length}`);
  }
}
