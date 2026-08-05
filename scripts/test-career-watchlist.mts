// WATCHLIST COM SCOUTING PROGRESSIVO (#41 — engine/career/watchlist.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addToWatchlist, removeFromWatchlist, watchOf, tickWatchlist, revealOf, apparentOvr, REVEAL_MAX,
} from '../src/engine/career/watchlist.ts';

test('add/remove/watchOf: sem duplicata, começa no nível 1', () => {
  let list = addToWatchlist(undefined, 'p1', 'fallen', 3);
  list = addToWatchlist(list, 'p1', 'fallen', 4);   // duplicata ignorada
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { playerId: 'p1', nick: 'fallen', addedAtSplit: 3, revealLevel: 1, lastReportSplit: 3 });
  assert.equal(watchOf(list, 'p1')?.nick, 'fallen');
  assert.equal(watchOf(list, 'p2'), null);
  assert.equal(removeFromWatchlist(list, 'p1').length, 0);
});

test('tick: com olheiro sobe todo split; sem olheiro a cada 2; cap no máximo', () => {
  let list = addToWatchlist([], 'p1', 'x', 3);
  // COM olheiro: 3 fechamentos = nível 4
  let scouted = list;
  for (const split of [3, 4, 5]) scouted = tickWatchlist(scouted, split, true);
  assert.equal(scouted[0].revealLevel, 4);
  // cap: mais um tick não passa de REVEAL_MAX
  assert.equal(tickWatchlist(scouted, 6, true)[0].revealLevel, REVEAL_MAX);
  // SEM olheiro: split 3 (delta 0) não sobe; split 5 (delta 2) sobe
  let solo = tickWatchlist(list, 3, false);
  assert.equal(solo[0].revealLevel, 1);
  solo = tickWatchlist(solo, 4, false);
  assert.equal(solo[0].revealLevel, 1);
  solo = tickWatchlist(solo, 5, false);
  assert.equal(solo[0].revealLevel, 2);
  assert.equal(solo[0].lastReportSplit, 5);
  // imutabilidade
  assert.equal(list[0].revealLevel, 1);
});

test('revealOf: bandas afinam e revelações acumulam por nível', () => {
  assert.deepEqual(revealOf(1), { ovrBand: 6, showPersonality: false, showSubRole: false, showPotential: false });
  assert.deepEqual(revealOf(2), { ovrBand: 3, showPersonality: true, showSubRole: false, showPotential: false });
  assert.deepEqual(revealOf(3), { ovrBand: 1, showPersonality: true, showSubRole: true, showPotential: false });
  assert.deepEqual(revealOf(4), { ovrBand: 0, showPersonality: true, showSubRole: true, showPotential: true });
  // clamp de níveis fora da faixa
  assert.equal(revealOf(0).ovrBand, 6);
  assert.equal(revealOf(9).ovrBand, 0);
});

test('apparentOvr: determinístico, dentro da banda, exato no nível 4', () => {
  for (let level = 1; level <= 4; level++) {
    const band = revealOf(level).ovrBand;
    const a = apparentOvr(80, 'p1', level);
    assert.equal(a, apparentOvr(80, 'p1', level));            // não dança entre renders
    assert.ok(Math.abs(a - 80) <= band, `nível ${level}: ${a} fora de 80±${band}`);
  }
  assert.equal(apparentOvr(80, 'qualquer', 4), 80);
  // clamps de OVR
  assert.ok(apparentOvr(41, 'p-low', 1) >= 40);
  assert.ok(apparentOvr(98, 'p-high', 1) <= 99);
  // ruído varia por jogador (não é constante global) — ao menos 1 difere em 12 ids
  const vals = Array.from({ length: 12 }, (_, i) => apparentOvr(80, `p${i}`, 1));
  assert.ok(new Set(vals).size > 1);
});
