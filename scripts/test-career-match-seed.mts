// SEED DA PARTIDA DA CARREIRA (engine/career/matchSeed.ts) — O1-46 / ENGI-11.
// F5 durante a animação re-simula a MESMA partida: seed estável pelo save,
// distinto entre jogos, etapas e carreiras.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerMatchSeed } from '../src/engine/career/matchSeed.ts';
import { simulateSeries } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import type { TPlayer, TTeam } from '../src/types.ts';

const save = { org: { name: 'Furia Jr', tag: 'FJR', colors: ['#000', '#fff'] as [string, string] }, split: 3, eventInSplit: 2 };

function team(id: string, v: number): TTeam {
  const players: TPlayer[] = Array.from({ length: 5 }, (_, i) => ({
    id: `${id}${i}`, sourcePlayerId: `${id}${i}`, nick: `${id}${i}`, name: `${id}${i}`, country: 'br',
    role: (['Entry', 'AWP', 'Rifler', 'Support', 'IGL'] as const)[i], playstyle: 'balanced' as TPlayer['playstyle'],
    aim: 70 + v, clutch: 68, consistency: 70, awp: 65, igl: 60, skill: 70 + v, ovr: 76 + v, form: 1,
  }));
  return {
    id, name: id, tag: id, country: 'br', isUser: false, game: 'CS2', colors: ['#111', '#eee'], strength: 75, teamwork: 70,
    mapPrefs: {}, coach: { name: 'c', style: 'balanced' } as TTeam['coach'], players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  };
}

test('carreira: mesmo save + mesmo jogo = mesmo seed = mesma série (F5 não re-rola)', () => {
  const k = 'lg:Liga:4:user:rival';
  assert.equal(careerMatchSeed(save, k), careerMatchSeed(structuredClone(save), k));
  const run = () => simulateSeries(makeRng(careerMatchSeed(save, k)), team('user', 2), team('rival', 0), [
    { map: 'mirage', pickedBy: 0 }, { map: 'nuke', pickedBy: 1 }, { map: 'ancient', pickedBy: -1 },
  ], 3);
  const a = run(), b = run();
  assert.deepEqual(a.mapScore, b.mapScore);
  assert.deepEqual(a.maps.map((m) => m.score), b.maps.map((m) => m.score));
});

test('carreira: o seed muda entre jogos, etapas, splits e orgs', () => {
  const seeds = new Set([
    careerMatchSeed(save, 'lg:Liga:4:user:rival'),
    careerMatchSeed(save, 'lg:Liga:5:user:rival'),
    careerMatchSeed({ ...save, eventInSplit: 3 }, 'lg:Liga:4:user:rival'),
    careerMatchSeed({ ...save, split: 4 }, 'lg:Liga:4:user:rival'),
    careerMatchSeed({ ...save, org: { ...save.org, name: 'Outra' } }, 'lg:Liga:4:user:rival'),
    careerMatchSeed({ ...save, org: null }, 'lg:Liga:4:user:rival'),
  ]);
  assert.equal(seeds.size, 6);
});
