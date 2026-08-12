// LISTAGEM DE VENDA (#15 — engine/career/listedSales.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingSaleChance, tickListedSales, LISTING_MAX_RATIO } from '../src/engine/career/listedSales.ts';

const BUYERS = [
  { id: 'b1', name: 'Alpha', tag: 'ALF' },
  { id: 'b2', name: 'Beta', tag: 'BET' },
];

test('curva de chance: monotônica decrescente, banana vende, ganância encalha', () => {
  assert.equal(listingSaleChance(0.5), 0.9);
  assert.equal(listingSaleChance(2), 0.02);
  assert.equal(listingSaleChance(0), 0);
  assert.equal(listingSaleChance(NaN), 0);
  let prev = 1;
  for (let r = 0.7; r <= 1.61; r += 0.05) {
    const c = listingSaleChance(r);
    assert.ok(c <= prev + 1e-9, `curva subiu em ${r.toFixed(2)}`);
    assert.ok(c >= 0.02 - 1e-9 && c <= 0.9 + 1e-9);
    prev = c;
  }
  assert.ok(Math.abs(listingSaleChance(1.0) - 0.45) < 1e-9);
  assert.ok(LISTING_MAX_RATIO >= 1.5);
});

test('tick: determinístico, respeita exclusões e sorteia comprador estável', () => {
  const args = {
    listed: { p1: 400_000, p2: 900_000 },
    split: 5,
    valueOf: (pid: string) => (pid === 'p1' ? 500_000 : 600_000),   // p1 barato (0.8), p2 caro (1.5)
    buyers: BUYERS,
  };
  const a = tickListedSales(args);
  const b = tickListedSales(args);
  assert.deepEqual(a, b, 'não determinístico');
  for (const hit of a) {
    assert.ok(BUYERS.some((x) => x.id === hit.buyer.id));
    assert.ok(hit.fee > 0);
  }
  // preço barato vende com frequência ao longo dos splits; caro quase nunca
  let cheap = 0, greedy = 0;
  for (let split = 1; split <= 40; split++) {
    const hits = tickListedSales({ ...args, split });
    if (hits.some((h) => h.playerId === 'p1')) cheap++;
    if (hits.some((h) => h.playerId === 'p2')) greedy++;
  }
  assert.ok(cheap >= 25, `barato vendeu só ${cheap}/40`);
  assert.ok(greedy <= 5, `ganancioso vendeu ${greedy}/40`);
  // exclusão (já em pendingSales) e sem compradores → nada
  assert.deepEqual(tickListedSales({ ...args, exclude: new Set(['p1', 'p2']) }), []);
  assert.deepEqual(tickListedSales({ ...args, buyers: [] }), []);
  // valor não-avaliável ou preço inválido → ignorado sem explodir
  assert.deepEqual(tickListedSales({ listed: { x: NaN, y: 100 }, split: 1, valueOf: () => null, buyers: BUYERS }), []);
});
