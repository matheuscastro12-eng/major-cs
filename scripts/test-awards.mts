// T#9 — Prêmios por desempenho. Roda via `npm run test:sim`.
//
// Cobertura:
//   - scorePlayerYear: rating manda; volume tem retorno decrescente com piso
//   - detectYearAwards (perf): POTY = melhor rating; Revelação ≠ POTY; <22 only
//   - Time da Temporada: 5 jogadores, cobre AWP+IGL, sem duplicar
//   - amostra mínima (AWARD_MIN_MAPS) filtra quem jogou pouco
//   - fallback no proxy de peakOvr quando não há yearLines

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectYearAwards,
  scorePlayerYear,
  AWARD_MIN_MAPS,
  type PlayerYearLine,
  type AwardsState,
  type AwardsLookups,
} from '../src/engine/awards.ts';

function line(opts: Partial<PlayerYearLine> & { playerId: string }): PlayerYearLine {
  return {
    nick: opts.playerId,
    role: 'Rifler',
    age: 24,
    mine: false,
    rating: 1.0,
    kd: 1.0,
    adr: 75,
    impact: 1.0,
    maps: 20,
    ...opts,
  };
}

const noLookups: AwardsLookups = {
  nickById: (id) => id,
  ageById: () => 24,
  joinedThisYear: () => false,
};

// state que dispara a detecção do ano 1 (split 5)
function stateYear1(squadIds: string[]): AwardsState {
  return {
    split: 5,
    titles: 0,
    squad: squadIds.map((playerId) => ({ playerId })),
    yearAwardsHistory: [],
  };
}

test('scorePlayerYear: rating maior vence em igualdade de volume', () => {
  const hi = line({ playerId: 'a', rating: 1.3, maps: 20 });
  const lo = line({ playerId: 'b', rating: 0.9, maps: 20 });
  assert.ok(scorePlayerYear(hi) > scorePlayerYear(lo));
});

test('scorePlayerYear: volume tem piso (poucos mapas não zera o score)', () => {
  const few = line({ playerId: 'a', rating: 1.2, maps: 6 });
  const many = line({ playerId: 'b', rating: 1.2, maps: 40 });
  // mais mapas pontua mais, mas o de poucos mapas mantém >= 50% do volume
  assert.ok(scorePlayerYear(many) > scorePlayerYear(few));
  assert.ok(scorePlayerYear(few) > 0);
});

test('POTY = melhor rating do ano (desempenho, não OVR)', () => {
  const lines = [
    line({ playerId: 'star', rating: 1.35, maps: 22 }),
    line({ playerId: 'mid', rating: 1.0, maps: 22 }),
    line({ playerId: 'low', rating: 0.8, maps: 22 }),
  ];
  const aw = detectYearAwards(stateYear1(['star']), noLookups, lines);
  assert.ok(aw);
  const poty = aw!.winners.find((w) => w.kind === 'mvp');
  assert.equal(poty?.playerNick, 'star');
});

test('Revelação é o melhor JOVEM (<22) e nunca o próprio POTY', () => {
  const lines = [
    line({ playerId: 'veteranStar', rating: 1.4, age: 27, maps: 22 }),
    line({ playerId: 'youngStar', rating: 1.25, age: 19, maps: 22 }),
    line({ playerId: 'youngMid', rating: 1.0, age: 20, maps: 22 }),
  ];
  const aw = detectYearAwards(stateYear1(['veteranStar']), noLookups, lines);
  const rookie = aw!.winners.find((w) => w.kind === 'rookie');
  assert.equal(rookie?.playerNick, 'youngStar');
  // o POTY (veteranStar, 27a) não pode aparecer como revelação
  assert.notEqual(rookie?.playerNick, 'veteranStar');
});

test('Time da Temporada: 5 jogadores, cobre AWP e IGL, sem duplicar', () => {
  const lines = [
    line({ playerId: 'awp1', role: 'AWP', rating: 1.3, maps: 22 }),
    line({ playerId: 'igl1', role: 'IGL', rating: 0.95, maps: 22 }),
    line({ playerId: 'rif1', role: 'Rifler', rating: 1.2, maps: 22 }),
    line({ playerId: 'rif2', role: 'Entry', rating: 1.15, maps: 22 }),
    line({ playerId: 'rif3', role: 'Lurker', rating: 1.1, maps: 22 }),
    line({ playerId: 'rif4', role: 'Support', rating: 1.05, maps: 22 }),
  ];
  const aw = detectYearAwards(stateYear1(['awp1']), noLookups, lines);
  const tos = aw!.winners.find((w) => w.kind === 'teamOfSeason');
  assert.ok(tos?.lineup);
  assert.equal(tos!.lineup!.length, 5);
  const nicks = tos!.lineup!.map((s) => s.nick);
  assert.equal(new Set(nicks).size, 5, 'sem duplicatas');
  assert.ok(nicks.includes('awp1'), 'inclui o AWP');
  assert.ok(nicks.includes('igl1'), 'inclui o IGL mesmo com rating menor');
});

test('amostra mínima: quem jogou < AWARD_MIN_MAPS não concorre', () => {
  const lines = [
    line({ playerId: 'fluke', rating: 2.0, maps: AWARD_MIN_MAPS - 1 }),
    line({ playerId: 'real', rating: 1.1, maps: 22 }),
  ];
  const aw = detectYearAwards(stateYear1(['real']), noLookups, lines);
  const poty = aw!.winners.find((w) => w.kind === 'mvp');
  assert.equal(poty?.playerNick, 'real', 'o de 1 mapa de sorte não vence');
});

test('sem yearLines: cai no proxy de peakOvr (back-compat)', () => {
  const state: AwardsState = {
    ...stateYear1(['p1']),
    peakOvr: { p1: 88 },
  };
  const aw = detectYearAwards(state, noLookups);
  assert.ok(aw);
  const poty = aw!.winners.find((w) => w.kind === 'mvp');
  assert.equal(poty?.playerNick, 'p1');
});

test('proxy path: jovem que é POTY não vira Revelação também (dedup no fallback)', () => {
  // único jovem do elenco, sem partidas (proxy) → é POTY; não pode duplicar
  const youngLookups: AwardsLookups = {
    nickById: (id) => id,
    ageById: () => 20, // todos jovens
    joinedThisYear: () => false,
  };
  const state: AwardsState = {
    ...stateYear1(['prodigy']),
    peakOvr: { prodigy: 86 },
  };
  const aw = detectYearAwards(state, youngLookups); // sem yearLines
  const poty = aw!.winners.find((w) => w.kind === 'mvp');
  const rookie = aw!.winners.find((w) => w.kind === 'rookie');
  assert.equal(poty?.playerNick, 'prodigy');
  assert.ok(!rookie || rookie.playerNick !== 'prodigy', 'POTY não repete como Revelação');
});

test('Técnico do Ano sai quando há título e nick do coach', () => {
  const lines = [line({ playerId: 'a', rating: 1.1, maps: 22 })];
  const state: AwardsState = {
    ...stateYear1(['a']),
    titles: 1,
    coach: { nick: 'zews' },
  };
  const aw = detectYearAwards(state, noLookups, lines);
  const coach = aw!.winners.find((w) => w.kind === 'coachOfYear');
  assert.equal(coach?.coachNick, 'zews');
});
