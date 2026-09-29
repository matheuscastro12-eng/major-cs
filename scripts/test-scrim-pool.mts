// Pool de sparrings da scrim (engine/scrim.ts#listScrimOpponents). Roda via
// `npm run test:sim`.
//
// Bug relatado: "chega um determinado momento que não tem mais nenhum time pra
// fazer scrim". O filtro era absoluto (±7 de força): um time forte passava do
// topo do mundo + 7 (o topo da IA envelhece, o seu time treina) e a lista
// zerava. Agora a banda vale quando tem ≥3 times e, fora disso, entram os mais
// próximos — com menos química (scrimChemFactor) pra não virar farm.
//
// Cobertura:
//   - força muito acima do topo / abaixo do fundo: lista não vazia, ≥2 disponíveis
//   - excludeIds tira o time assumido
//   - regressão: com a banda cheia, a lista é a mesma de antes (≤6, todos na banda)
//   - química: cheia dentro da banda, cai fora dela, com piso
//   - forte/médio/fraco nunca ficam sem sparring em 10 splits do mundo da Carreira

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { TeamSeason } from '../src/types.ts';
import { buildUserTeam, orgRefSynergy, teamSeasonToTTeam } from '../src/engine/ratings.ts';
import { buildAiWorld } from '../src/engine/career/aiWorld.ts';
import { listScrimOpponents, runScrimVs, scrimChemFactor, SCRIM_STRENGTH_BAND } from '../src/engine/scrim.ts';
import { makeRng } from '../src/engine/rng.ts';
import { hashStr } from '../src/state/hash.ts';
import { simulateMundo } from './measure-mundo-10-splits.mts';

const world1 = buildAiWorld({ base: CS2_REAL_2026, split: 1, skip: new Set() });
const tt1 = world1.map(teamSeasonToTTeam);
const strengths = tt1.map((t) => t.strength);
const maxS = Math.max(...strengths);
const minS = Math.min(...strengths);

function assertUsable(opts: ReturnType<typeof listScrimOpponents>, label: string) {
  assert.ok(opts.length >= 3, `${label}: ${opts.length} sparrings (mínimo 3)`);
  assert.ok(opts.filter((o) => o.avail === 'available').length >= 2, `${label}: ≥2 disponíveis`);
}

test('scrim pool: força muito acima do topo do mundo ainda lista os mais próximos', () => {
  const my = maxS + 30;
  const opts = listScrimOpponents(my, tt1, 4, 0);
  assertUsable(opts, 'max+30');
  assert.ok(opts.every((o) => o.offBand), 'todos fora da banda');
  // os mais próximos = os mais fortes do mundo
  const top3 = [...tt1].sort((a, b) => b.strength - a.strength).slice(0, 3).map((t) => t.id);
  assert.deepEqual(opts.map((o) => o.id).sort(), [...top3].sort());
});

test('scrim pool: força muito abaixo do fundo do mundo ainda lista os mais próximos', () => {
  const opts = listScrimOpponents(minS - 30, tt1, 4, 1);
  assertUsable(opts, 'min-30');
  assert.ok(opts.every((o) => o.offBand && o.diff > 0));
});

test('scrim pool: excludeIds tira o time assumido (e aceita null/undefined)', () => {
  const self = [...tt1].sort((a, b) => b.strength - a.strength)[2];
  const opts = listScrimOpponents(self.strength, tt1, 2, 0, [self.id, null, undefined]);
  assert.ok(!opts.some((o) => o.id === self.id), 'o próprio time não é sparring');
  assertUsable(opts, 'excludeIds');
  // sem exclusão, o espelho aparece (diff 0 = o mais próximo)
  assert.equal(listScrimOpponents(self.strength, tt1, 2, 0)[0].id, self.id);
});

test('scrim pool: regressão com a banda cheia (mesma lista de antes)', () => {
  const sorted = [...tt1].sort((a, b) => a.strength - b.strength);
  const my = sorted[Math.floor(sorted.length / 2)].strength;
  const opts = listScrimOpponents(my, tt1, 3, 0);
  // cálculo antigo: filtro absoluto ±7, 6 mais próximos
  const legacy = tt1
    .filter((t) => Math.abs(t.strength - my) <= SCRIM_STRENGTH_BAND)
    .sort((a, b) => Math.abs(a.strength - my) - Math.abs(b.strength - my))
    .slice(0, 6);
  assert.equal(opts.length, 6);
  assert.deepEqual(opts.map((o) => o.id), legacy.map((t) => t.id));
  assert.ok(opts.every((o) => !o.offBand));
  for (const o of opts) {
    const roll = hashStr(`scrim:${o.id}:3:0`) % 10;
    if (roll <= 6) assert.equal(o.avail, 'available');
  }
  assert.deepEqual(opts, listScrimOpponents(my, tt1, 3, 0), 'determinístico');
});

test('scrim pool: química cheia na banda, reduzida fora dela, com piso', () => {
  assert.equal(scrimChemFactor(90, 90 + SCRIM_STRENGTH_BAND), 1);
  assert.equal(scrimChemFactor(90, 90 - SCRIM_STRENGTH_BAND), 1);
  const near = scrimChemFactor(100, 90);   // 3 além da banda
  const far = scrimChemFactor(100, 80);    // 13 além
  assert.ok(near < 1 && far < near, `${near} > ${far}`);
  assert.equal(scrimChemFactor(100, 40), 0.35, 'piso');
  // no runScrimVs: o mesmo resultado rende menos química contra sparring distante
  const me = teamSeasonToTTeam(world1[0]);
  const state = { split: 1, budget: 100_000, scrimsThisSplit: 0, starterIds: me.players.map((p) => p.id), pairChem: {}, fatigue: {} };
  const oppNear = { ...teamSeasonToTTeam(world1[1]), strength: me.strength - 3 };
  const oppFar = { ...oppNear, strength: me.strength - 30 };
  const a = runScrimVs(state, me, oppNear, makeRng(7)).report;
  const b = runScrimVs(state, me, oppFar, makeRng(7)).report;
  assert.equal(a.won, b.won, 'mesma seed, mesmo mapa/resultado (força não entra no motor aqui)');
  assert.ok(b.chemGain < a.chemGain && b.chemGain > 0, `${b.chemGain} < ${a.chemGain}`);
});

test('scrim pool: forte/médio/fraco nunca ficam sem sparring em 10 splits', () => {
  const worlds: TeamSeason[][] = [];
  simulateMundo(10, { onWorld: (s, w) => { if (s <= 10) worlds[s - 1] = w; } });
  assert.equal(worlds.length, 10);
  const rank = world1.map((t) => ({ t, s: teamSeasonToTTeam(t).strength })).sort((a, b) => b.s - a.s);
  const picks = { forte: rank[0].t, 'médio': rank[Math.floor(rank.length / 2)].t, fraco: rank[rank.length - 1].t };
  let emptiedBefore = 0;
  for (const [label, org] of Object.entries(picks)) {
    for (let s = 1; s <= 10; s++) {
      // takeover (teamwork real + sinergia de referência) + treino: +0,7/split nos atributos
      const k = 0.7 * (s - 1);
      const lineup = org.players.slice(0, 5).map((p) => ({
        player: { ...p, aim: p.aim + k, awp: p.awp + (p.role === 'AWP' ? k : 0), igl: p.igl + (p.role === 'IGL' ? k : 0), clutch: p.clutch + k, consistency: p.consistency + k },
        from: org,
      }));
      const me = buildUserTeam(org.team, lineup, org.coach, org.teamwork, orgRefSynergy(org));
      const tt = worlds[s - 1].map(teamSeasonToTTeam);
      const opts = listScrimOpponents(me.strength, tt, s, 0, [org.id]);
      assertUsable(opts, `${label} split ${s}`);
      assert.ok(!opts.some((o) => o.id === org.id));
      if (tt.filter((t) => t.id !== org.id && Math.abs(t.strength - me.strength) <= SCRIM_STRENGTH_BAND).length === 0) emptiedBefore++;
    }
  }
  // o cenário reproduz o bug: o filtro antigo zerava o time forte
  assert.ok(emptiedBefore > 0, 'o cenário deveria cobrir o caso que zerava a lista');
});
