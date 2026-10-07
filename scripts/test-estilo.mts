// ESTILO DE JOGO (Padrão, Agressivo, Passivo, Controle, Rush/Retake). `npm run test:sim`.
//
// Trava:
//   - neutralidade: Padrão (ou sem estilo) = motor de antes, bit a bit
//   - nenhum estilo domina: o melhor estilo muda com o perfil do elenco
//   - ganho do estilo ideal × pior numa MD3 na faixa planejada
//   - encaixe mostrado na tela ordena os estilos como a simulação
//   - familiaridade (cresce com uso, decai parada, escala o efeito)
//   - confronto de estilos (pedra-papel-tesoura leve) e variância (peso da mira)
//   - troca ao vivo (MapSim.setStyle) muda a % mostrada; estatística de estilo
//   - IA escolhe estilo coerente com o elenco; save sem estilo = Padrão

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { winProbT, type RoundSpec, type SideSpec } from '../src/engine/match2/round.ts';
import { makeRng } from '../src/engine/rng.ts';
import type { TTeam } from '../src/types.ts';
import { aiTactics, defaultTactics, resolveTeamPlan, tacticDuelMods, tacticsAfterMatch } from '../src/engine/gestao/tatica.ts';
import {
  aiStyle, setStyle, styleAfterSeries, styleFamOf, styleFit, styleFitPp, styleOf, styleProfile, styleQuality, styleDuelMods,
  STYLE_FAM_DEFAULT, STYLE_FAM_FLOOR, STYLE_RPS, STYLES_CT, STYLES_T, NEUTRAL_PROFILE,
} from '../src/engine/gestao/estilo.ts';
import type { TacticsState } from '../src/engine/gestao/model.ts';
import { realTeams, tierSTeams } from './calibrate-engine.mts';
import { mirrorStyle, reshape, bo3 } from './measure-estilo.mts';

const TEAMS = realTeams();
const T0 = TEAMS[4];
const withTac = (t: TTeam, tac: TacticsState | null): TTeam => ({ ...t, tactics: tac });

function playOut(a: TTeam, b: TTeam, seed: number) {
  const sim = createMapSimV2(makeRng(seed), a, b, 'inferno', -1);
  while (!sim.step()) { /* */ }
  return sim;
}

// ── neutralidade ────────────────────────────────────────────────────────────

test('neutralidade: estilo Padrão explícito = sem estilo (bit a bit)', () => {
  const base = { ...aiTactics(T0), style: undefined, styleFam: undefined };
  const std: TacticsState = { ...base, style: { t: 'standard', ct: 'standard' }, styleFam: { 't:rush': 90 } };
  const opp = { ...aiTactics(TEAMS[9]), style: undefined, styleFam: undefined };
  for (const seed of [1, 2, 3]) {
    const s1 = playOut(withTac(T0, base), withTac(TEAMS[9], opp), seed);
    const s2 = playOut(withTac(T0, std), withTac(TEAMS[9], opp), seed);
    assert.deepEqual(s1.score(), s2.score());
    assert.deepEqual(s1.roundLog(), s2.roundLog());
    assert.equal(s1.killFeed().length, s2.killFeed().length);
  }
  const p = resolveTeamPlan(std, 'inferno', T0.players, T0.id);
  assert.equal(p.profile, null, 'Padrão não calcula perfil');
  const m = tacticDuelMods({ plan: p, opp: null, side: 't' });
  assert.equal(m.kMult, undefined);
  assert.equal(m.engageMid, undefined);
  assert.equal(m.oppPlantMult, undefined);
});

test('save: tática sem estilo lê Padrão; defaultTactics não grava estilo', () => {
  assert.deepEqual(styleOf(defaultTactics()), { t: 'standard', ct: 'standard' });
  assert.equal(defaultTactics().style, undefined);
  assert.deepEqual(styleOf({ ...defaultTactics(), style: { t: 'xx' as 'rush', ct: 'retake' } }), { t: 'standard', ct: 'retake' });
  assert.equal(styleFamOf(defaultTactics(), 't', 'rush'), STYLE_FAM_DEFAULT);
  assert.equal(styleFamOf(defaultTactics(), 'ct', 'standard'), 100);
});

// ── nenhum estilo domina ────────────────────────────────────────────────────

test('perfil: o melhor estilo muda com o elenco; ideal × pior numa MD3 na faixa', () => {
  const N = 2400;
  // elenco de mira de entrada (entry/troca fortes, leitura/pós-plant fracos)
  const miraAgg = mirrorStyle('mira', { t: 'aggressive', ct: 'aggressive' }, N, 31).mapWinA;
  const miraPas = mirrorStyle('mira', { t: 'passive', ct: 'passive' }, N, 31).mapWinA;
  // elenco frio (pós-plant/clutch/retake fortes, entry/troca fracos)
  const friAgg = mirrorStyle('frieza', { t: 'aggressive', ct: 'aggressive' }, N, 31).mapWinA;
  const friPas = mirrorStyle('frieza', { t: 'passive', ct: 'passive' }, N, 31).mapWinA;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  assert.ok(miraAgg > miraPas + 0.02, `mira: agressivo ${pct(miraAgg)} deveria vencer passivo ${pct(miraPas)}`);
  assert.ok(friPas > friAgg + 0.01, `frieza: passivo ${pct(friPas)} deveria vencer agressivo ${pct(friAgg)}`);
  // ganho máximo ideal × pior numa MD3 (planejado ≈ 4–8 pp; tolerância de amostra)
  const d = (bo3(miraAgg) - bo3(miraPas)) * 100;
  assert.ok(d > 3 && d < 14, `mira: ideal × pior na MD3 = ${d.toFixed(1)} pp`);
  // elenco médio: nenhum estilo dispara na frente do Padrão
  for (const st of [{ t: 'rush', ct: 'control' }, { t: 'aggressive', ct: 'aggressive' }] as const) {
    const r = mirrorStyle('medio', st, N, 32).mapWinA;
    assert.ok(r < 0.54, `médio: ${st.t}/${st.ct} = ${pct(r)} (não pode dominar o Padrão)`);
  }
});

test('encaixe na tela ordena os estilos como o motor (mesmas formas)', () => {
  const mira = styleProfile(reshape(tierSTeams()[3], 'mira').players);
  const fri = styleProfile(reshape(tierSTeams()[3], 'frieza').players);
  for (const side of ['t', 'ct'] as const) {
    assert.ok(styleFitPp(side, 'aggressive', mira) > styleFitPp(side, 'passive', mira), `mira ${side}: agressivo > passivo`);
    assert.ok(styleFitPp(side, 'passive', fri) > styleFitPp(side, 'aggressive', fri), `frieza ${side}: passivo > agressivo`);
  }
  const f = styleFit('t', 'standard', mira);
  assert.equal(f.score, 50);
  assert.equal(f.pp, 0);
  // familiaridade escala o efeito mostrado
  assert.ok(Math.abs(styleFit('t', 'aggressive', mira, 90).pp) > Math.abs(styleFit('t', 'aggressive', mira, 20).pp));
});

// ── familiaridade ───────────────────────────────────────────────────────────

test('familiaridade: cresce com uso, decai parada (piso), escala a qualidade', () => {
  let t: TacticsState = setStyle(defaultTactics(), { t: 'rush' });
  t = { ...t, styleFam: { 'ct:passive': 60 } };
  const t2 = styleAfterSeries(t, 2);
  assert.ok(styleFamOf(t2, 't', 'rush') > STYLE_FAM_DEFAULT, 'rush usado sobe');
  assert.ok(styleFamOf(t2, 'ct', 'passive') < 60, 'passivo parado decai');
  let d: TacticsState = { ...defaultTactics(), styleFam: { 'ct:passive': STYLE_FAM_FLOOR + 0.5 } };
  for (let i = 0; i < 10; i++) d = styleAfterSeries(d, 0);
  assert.equal(styleFamOf(d, 'ct', 'passive'), STYLE_FAM_FLOOR);
  // fim de série na Carreira passa pelo estilo
  const after = tacticsAfterMatch(setStyle(defaultTactics(), { ct: 'retake' }), ['mirage', 'nuke'], 'opp');
  assert.ok(styleFamOf(after, 'ct', 'retake') > STYLE_FAM_DEFAULT);
  assert.ok(styleQuality(90, 50) > styleQuality(30, 50));
  assert.ok(styleQuality(60, 90) > styleQuality(60, 20), 'familiaridade do mapa (fase 2) também conta');
});

// ── confronto e variância ───────────────────────────────────────────────────

test('confronto de estilos: Padrão neutro; CT agressivo pune o T lento e sofre com rush', () => {
  for (const s of STYLES_T) assert.equal(STYLE_RPS.standard[s], 0);
  for (const s of STYLES_CT) assert.equal(STYLE_RPS[s].standard, 0);
  const base = { side: 't' as const, q: 1, profile: NEUTRAL_PROFILE, ids: [], roles: [], styles: [] };
  assert.ok(styleDuelMods({ ...base, style: 'control', oppStyle: 'aggressive' }).teamLogit < 0);
  assert.ok(styleDuelMods({ ...base, style: 'rush', oppStyle: 'aggressive' }).teamLogit > 0);
  assert.ok(styleDuelMods({ ...base, style: 'rush', oppStyle: 'retake' }).teamLogit < 0, 'retake pune o rush');
});

test('variância: estilo caótico (kMult < 1) ajuda o azarão no duelo', () => {
  const side = (v: number): SideSpec => ({
    base: new Float64Array(5).fill(v), mod: new Float64Array(5), phase1: new Float64Array(5).fill(v), sense: new Float64Array(5).fill(v),
    phase2: new Float64Array(5).fill(v), clutch: new Float64Array(5).fill(v), trade: new Float64Array(5).fill(12), eq: new Float64Array(5),
    awp: new Uint8Array(5), wOpen: new Float64Array(5).fill(1), wMid: new Float64Array(5).fill(1), wPost: new Float64Array(5).fill(1), tradeTeam: 1, saveMult: 1,
  });
  const spec = (k?: number): RoundSpec => ({ sides: [side(13), side(16)], bias: 0, plantMult: 1, ...(k ? { kMult: k } : {}) });
  const p1 = winProbT(spec()), pChaos = winProbT(spec(0.9)), pCtrl = winProbT(spec(1.1));
  assert.ok(pChaos > p1 && p1 > pCtrl, `azarão: caos ${pChaos.toFixed(3)} > normal ${p1.toFixed(3)} > controle ${pCtrl.toFixed(3)}`);
});

// ── ao vivo e estatística ───────────────────────────────────────────────────

test('ao vivo: setStyle muda a % mostrada; estatística de estilo fecha com o placar', () => {
  const a = withTac(reshape(T0, 'mira'), { ...aiTactics(T0), style: { t: 'standard', ct: 'standard' }, styleFam: { 't:aggressive': 80, 'ct:aggressive': 80 } });
  const b = withTac(TEAMS[9], aiTactics(TEAMS[9]));
  const sim = createMapSimV2(makeRng(77), a, b, 'mirage', -1);
  const before = sim.peekWinProb(0);
  sim.setStyle!(0, { t: 'aggressive', ct: 'aggressive' });
  assert.deepEqual(sim.style!(0), { t: 'aggressive', ct: 'aggressive' });
  const after = sim.peekWinProb(0);
  assert.notEqual(before, after, 'trocar o estilo muda a % do round');
  while (!sim.step()) { /* */ }
  const r = sim.result();
  assert.ok(r.styleStats && r.styles);
  const [s0, s1] = r.styleStats!;
  const rounds = r.score[0] + r.score[1];
  assert.equal(s0.rounds, rounds);
  assert.equal(s0.tRounds + s0.ctRounds, rounds);
  assert.equal(s0.tRounds, s1.ctRounds);
  assert.ok(s0.openWon + s1.openWon <= rounds && s0.openWon + s1.openWon >= rounds - 2);
  assert.equal(s0.retakes + s1.postWon, s0.ctPlantsAgainst);
  assert.deepEqual(r.styles![0], { t: 'aggressive', ct: 'aggressive' });
  // sem tática nos dois lados, o resultado não ganha campos novos
  const plain = playOut(T0, TEAMS[9], 5).result();
  assert.equal(plain.styleStats, undefined);
});

// ── IA ──────────────────────────────────────────────────────────────────────

test('IA: estilo coerente com o elenco (e variado na base)', () => {
  const ts = tierSTeams();
  const mira = aiStyle({ players: reshape(ts[3], 'mira').players });
  const fri = aiStyle({ players: reshape(ts[3], 'frieza').players });
  assert.ok(['aggressive', 'rush'].includes(mira.style.t), `mira T: ${mira.style.t}`);
  assert.ok(!['aggressive', 'rush'].includes(fri.style.t), `frieza T: ${fri.style.t}`);
  const seen = new Set<string>();
  for (const t of TEAMS) { const s = aiStyle(t).style; seen.add(`t:${s.t}`); seen.add(`ct:${s.ct}`); }
  assert.ok(seen.size >= 5, `a IA usa estilos variados: ${[...seen].join(', ')}`);
  // a IA grava familiaridade do estilo escolhido
  const tac = aiTactics(ts[3]);
  if (tac.style && tac.style.t !== 'standard') assert.ok(styleFamOf(tac, 't', tac.style.t) >= 35);
});
