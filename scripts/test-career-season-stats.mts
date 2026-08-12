// SEASON STATS (#13/#29 — engine/career/seasonStats.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankSeasonEvent, seasonLinesOf, placementSummary, deriveEventLine } from '../src/engine/career/seasonStats.ts';
import type { League } from '../src/engine/league.ts';

// liga sintética mínima: 2 times, 1 partida, 1 mapa, stats de 2 jogadores.
function fakeLeague(k1 = 20, k2 = 12): League {
  const stats = (k: number, d: number) => ({ both: { kills: k, deaths: d, assists: 4, dmg: k * 80, kastRounds: 16, rounds: 24 } });
  return {
    name: 'Liga Teste',
    teams: [
      { id: 'user', players: [{ id: 'p1' }] },
      { id: 'rival', players: [{ id: 'p2' }] },
    ],
    rounds: [[{ a: 'user', b: 'rival', result: { maps: [{ stats: { p1: stats(k1, 10), p2: stats(k2, 18) } }] } }]],
  } as unknown as League;
}

const META = { split: 3, event: 2, eventName: 'ESL Teste', tier: 2, placements: { user: 1 }, championTeamId: 'user' };

test('bankSeasonEvent: uma linha por jogador por evento, com colocação do time', () => {
  const s1 = bankSeasonEvent(undefined, fakeLeague(), META);
  assert.equal(s1.p1.length, 1);
  assert.equal(s1.p2.length, 1);
  const l = s1.p1[0];
  assert.equal(l.split, 3);
  assert.equal(l.event, 2);
  assert.equal(l.eventName, 'ESL Teste');
  assert.equal(l.k, 20);
  assert.equal(l.maps, 1);
  // #29: colocação/troféu vêm do TIME do jogador
  assert.equal(l.placement, 1);
  assert.equal(l.champion, true);
  assert.equal(s1.p2[0].placement, null);   // time rival: colocação desconhecida
  assert.equal(s1.p2[0].champion, false);
  // evento seguinte APENSA (histórico cresce, nunca sobrescreve)
  const s2 = bankSeasonEvent(s1, fakeLeague(25), { ...META, event: 3, placements: { user: 4 }, championTeamId: null });
  assert.equal(s2.p1.length, 2);
  assert.equal(s2.p1[1].placement, 4);
  assert.equal(s2.p1[1].champion, false);
  // imutável: o primeiro snapshot não mudou
  assert.equal(s1.p1.length, 1);
});

test('seasonLinesOf + placementSummary: consulta e conquistas contáveis', () => {
  let s = bankSeasonEvent(undefined, fakeLeague(), META);
  s = bankSeasonEvent(s, fakeLeague(), { ...META, event: 3, placements: { user: 2 }, championTeamId: null });
  s = bankSeasonEvent(s, fakeLeague(), { ...META, split: 4, event: 1, placements: { user: 1 }, championTeamId: 'user' });
  const lines = seasonLinesOf(s, 'p1');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].split, 4);          // mais recente primeiro
  const sum = placementSummary(s, 'p1');
  assert.deepEqual(sum, { titles: 2, runnerUp: 1, top4: 3, events: 3 });
  assert.deepEqual(seasonLinesOf(s, 'ninguem'), []);
});

test('deriveEventLine: rating na faixa e proporcional ao desempenho', () => {
  const s = bankSeasonEvent(undefined, fakeLeague(24, 6), META);
  const good = deriveEventLine(s.p1[0])!;
  const bad = deriveEventLine(s.p2[0])!;
  assert.ok(good.rating > bad.rating, 'quem mata mais tem rating maior');
  assert.ok(good.rating > 0.9 && good.rating < 2.2);
  assert.ok(good.kd > 1 && bad.kd < 1);
  assert.equal(deriveEventLine({ ...s.p1[0], rounds: 0 }), null);
});
