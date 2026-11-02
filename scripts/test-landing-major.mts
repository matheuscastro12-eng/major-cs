// Landing com o Major primeiro (src/components/Landing.tsx + data/majorLanding.ts):
// qual hero mostrar por data, a fase do Major, as portas do "Em 1 minuto", os
// favoritos copiados do Modo Major (conferidos contra o engine) e a trava de
// performance: a landing está no chunk inicial e não pode puxar o JSON dos 32
// times. Roda `tsx --test scripts/test-landing-major.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import { titleOdds, type MajorData } from '../src/engine/majorSingapore.ts';
import { MAJOR_SG_PROMO_ENDS_MS } from '../src/data/majorWindow.ts';
import {
  MAJOR_FAVORITES, MAJOR_SG_FINAL_MS, MAJOR_SG_MILESTONES, MAJOR_SG_PLAYOFFS_MS, MAJOR_SG_START_MS,
  landingDoors, landingHero, landingModes, majorPhase, milestonesReached,
} from '../src/data/majorLanding.ts';

const D = data as unknown as MajorData;
const ROOT = new URL('..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
// AAAA-MM-DD de um instante no fuso de Brasília (UTC-3, sem horário de verão)
const brDate = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);

test('hero do Major durante a vitrine, geral depois dela', () => {
  assert.equal(landingHero(Date.UTC(2026, 9, 30, 15), true), 'major');      // 30/10, campanha
  assert.equal(landingHero(Date.UTC(2026, 11, 13, 23), true), 'major');     // dia da final, 20h em Brasília
  assert.equal(landingHero(MAJOR_SG_PROMO_ENDS_MS - 1, true), 'major');
  assert.equal(landingHero(MAJOR_SG_PROMO_ENDS_MS, true), 'geral');         // 14/12 00:00 em Brasília
  assert.equal(landingHero(Date.UTC(2027, 0, 10), true), 'geral');
});

test('sem onMajor (App que não sabe abrir o modo) o hero é o geral', () => {
  assert.equal(landingHero(Date.UTC(2026, 9, 30, 15), false), 'geral');
});

test('as datas da landing batem com o JSON do Major', () => {
  assert.equal(brDate(MAJOR_SG_START_MS), D.event.start);
  assert.equal(brDate(MAJOR_SG_PLAYOFFS_MS), D.event.playoffsStart);
  assert.equal(brDate(MAJOR_SG_FINAL_MS), D.event.end);
  assert.deepEqual(MAJOR_SG_MILESTONES.map((m) => m.date), ['24/11', '10/12', '13/12']);
  // a vitrine sai no fim do dia da final
  assert.equal(MAJOR_SG_PROMO_ENDS_MS - MAJOR_SG_FINAL_MS, 86_400_000);
});

test('fase do Major: contagem em dias, stages, playoffs e fim', () => {
  assert.deepEqual(majorPhase(Date.UTC(2026, 9, 30, 15)), { kind: 'pre', days: 25 });       // 30/10 12h → 24/11
  assert.deepEqual(majorPhase(Date.UTC(2026, 9, 30, 3)), { kind: 'pre', days: 25 });        // 30/10 00:00
  assert.deepEqual(majorPhase(Date.UTC(2026, 10, 23, 13)), { kind: 'pre', days: 1 });       // véspera: "amanhã"
  assert.deepEqual(majorPhase(MAJOR_SG_START_MS - 1), { kind: 'pre', days: 1 });
  assert.deepEqual(majorPhase(MAJOR_SG_START_MS), { kind: 'stages' });
  assert.deepEqual(majorPhase(MAJOR_SG_PLAYOFFS_MS - 1), { kind: 'stages' });
  assert.deepEqual(majorPhase(MAJOR_SG_PLAYOFFS_MS), { kind: 'playoffs' });
  assert.deepEqual(majorPhase(MAJOR_SG_PROMO_ENDS_MS - 1), { kind: 'playoffs' });
  assert.deepEqual(majorPhase(MAJOR_SG_PROMO_ENDS_MS), { kind: 'over' });
});

test('régua do hero: marcos que já chegaram', () => {
  assert.equal(milestonesReached(Date.UTC(2026, 9, 30, 15)), 0);
  assert.equal(milestonesReached(MAJOR_SG_START_MS), 1);
  assert.equal(milestonesReached(MAJOR_SG_PLAYOFFS_MS), 2);
  assert.equal(milestonesReached(MAJOR_SG_FINAL_MS), 3);
});

test('"Em 1 minuto": 3 portas, e o resto dos modos fica na seção compacta', () => {
  assert.deepEqual(landingDoors('major'), ['major', 'diario', 'draft']);
  assert.deepEqual(landingModes('major'), ['carreira', 'rtp', 'ultimate', 'online']);
  assert.deepEqual(landingDoors('geral'), ['diario', 'draft', 'carreira']);
  assert.deepEqual(landingModes('geral'), ['rtp', 'ultimate', 'online']);
  for (const h of ['major', 'geral'] as const) {
    const doors = new Set<string>(landingDoors(h));
    assert.ok(landingModes(h).every((m) => !doors.has(m)), `modo repetido nas portas (${h})`);
  }
});

test('tempos das portas são os mesmos do onboarding (sem promessa nova)', () => {
  const landing = read('src/components/Landing.tsx');
  const i18n = read('src/state/i18n.tsx');
  assert.match(i18n, /'onboard\.majorMeta': '~1 min · sem conta'/);
  assert.match(i18n, /'onboard\.draftMeta': '~15 min'/);
  assert.match(landing, /major: \{ time: '~1 min'/);
  assert.match(landing, /draft: \{ time: '~15 min'/);
  assert.match(landing, /diario: \{ time: '2 min'/);
});

test('favoritos da landing = painel "Favoritos (1.000 simulações)" do Modo Major', () => {
  const odds = titleOdds(D, MAJOR_FAVORITES.runs);
  const top = [...D.teams].sort((a, b) => (odds.get(b.id) ?? 0) - (odds.get(a.id) ?? 0)).slice(0, MAJOR_FAVORITES.teams.length);
  const expected = top.map((t) => ({ id: t.id, tag: t.tag, name: t.name, pct: Number(((odds.get(t.id) ?? 0) * 100).toFixed(1)) }));
  assert.deepEqual(MAJOR_FAVORITES.teams, expected,
    `o JSON do Major mudou: atualize MAJOR_FAVORITES.teams em src/data/majorLanding.ts para\n${JSON.stringify(expected, null, 2)}`);
  assert.equal(MAJOR_FAVORITES.status, D.event.status, 'status da lista (projecao/oficial) diferente do JSON');
  assert.equal(MAJOR_FAVORITES.listDate, D.event.listDate);
  assert.equal(MAJOR_FAVORITES.teams.length, 4);
});

// ── trava de performance: o grafo de imports estáticos da landing ───────────
// Segue import/export ... from e import '...' relativos (o dinâmico import()
// vira chunk à parte e fica de fora; `import type` some no build).
const EXTS = ['', '.ts', '.tsx', '.json', '/index.ts', '/index.tsx'];
function resolveImport(fromFile: string, spec: string): string | null {
  const base = join(dirname(fromFile), spec);
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [join(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specs = [
      ...[...src.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
      ...[...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ];
    for (const s of specs) {
      if (!s.startsWith('.') || s.endsWith('.css')) continue;
      const r = resolveImport(f, s);
      if (r) stack.push(r);
    }
  }
  return seen;
}

test('a landing não puxa o JSON dos 32 times nem o engine do Major (chunk inicial)', () => {
  const graph = [...staticGraph('src/components/Landing.tsx')].map((f) => relative(ROOT, f));
  assert.ok(graph.includes('src/data/majorLanding.ts'), 'grafo não chegou em data/majorLanding.ts: o parser de imports quebrou?');
  assert.ok(graph.includes('src/data/majorWindow.ts'));
  assert.ok(graph.length > 20, `grafo pequeno demais (${graph.length}): o parser de imports quebrou?`);
  const bad = graph.filter((f) => f.endsWith('major-singapore-2026.json') || f.endsWith('engine/majorSingapore.ts'));
  assert.deepEqual(bad, []);
  assert.ok(!read('src/data/majorLanding.ts').includes("from './major-singapore-2026.json'"));
});

test('clique no Major medido uma vez só (no App) e funil da landing intacto', () => {
  const landing = read('src/components/Landing.tsx');
  const app = read('src/App.tsx');
  assert.ok(!/track\(\s*'major_vitrine_click'/.test(landing), 'a landing não mede o clique: o onMajor do App já mede');
  assert.equal(app.match(/track\('major_vitrine_click', \{ surface: 'landing' \}\)/g)?.length, 1);
  for (const src of ['landing-nav', 'landing-hero', 'landing-pricing', 'landing-final', 'landing-ghost']) {
    assert.ok(landing.includes(`'${src}'`), `src ${src} sumiu da landing`);
  }
  assert.ok(app.includes("trackPaywallView('landing')"));
  // a faixa estreita do Major (lp-notice) saiu: com a vitrine no ar, o Major é o hero
  assert.ok(!landing.includes("ct('Abrir o Modo Major')"));
});
