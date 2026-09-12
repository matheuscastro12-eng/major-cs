import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRivalry, rivalryFor, rivalryPair } from './rivalry.js';

test('par é canônico por e-mail (case-insensitive), não por apelido', () => {
  assert.equal(rivalryPair('B@x.com', 'a@x.com').pair, 'a@x.com|b@x.com');
  assert.equal(rivalryPair('a@x.com', 'B@x.com').pair, 'a@x.com|b@x.com');
});

test('aplica vitórias no lado certo e atualiza nicks/último duelo', () => {
  let r = applyRivalry(null, { emailA: 'a@x.com', emailB: 'b@x.com', nickA: 'Ana#1', nickB: 'Bo#2', winner: 'b@x.com', now: 10, code: 'ABCDE' });
  assert.equal(r.wins_a, 0); assert.equal(r.wins_b, 1); assert.equal(r.games, 1);
  r = applyRivalry(r, { emailA: 'b@x.com', emailB: 'a@x.com', nickA: 'Bo#9', nickB: 'Ana#1', winner: 'a@x.com', now: 20, code: 'FGHJK' });
  assert.equal(r.wins_a, 1); assert.equal(r.wins_b, 1); assert.equal(r.nick_b, 'Bo#9'); assert.equal(r.last_code, 'FGHJK');
  const me = rivalryFor(r, 'A@x.com');
  assert.deepEqual(me, { oppNick: 'Bo#9', wins: 1, losses: 1, games: 2, lastAt: 20 });
});
