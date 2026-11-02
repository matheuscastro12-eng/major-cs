import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptServerGrants } from '../src/engine/ultimate/serverGrants';
import { defaultUltimateState, grantCard } from '../src/engine/ultimate/state';
import { bestOnlineSwap } from '../src/engine/ultimate/onlineSwap';

const known = () => true;

test('adota cartas de backfill/cortesia e créditos heal:* uma única vez', () => {
  let s = defaultUltimateState();
  s = { ...s, profile: { ...s.profile, credits: 2790 } };
  const input = {
    cards: [
      { cardId: 'sbc_bf_1', cardKey: 'bo3_24881:elite', meta: { backfill: true, acquiredVia: 'sbc' } },
      { cardId: 'gw_k', cardKey: 'bo3_51876:legendary', meta: { goodwill: true } },
      { cardId: 'x1', cardKey: 'bo3_1:gold', meta: { acquiredVia: 'pack' } }, // não é concessão
    ],
    credits: [{ opId: 'heal:sbc-credits:1-2', creditsDelta: 20000 }, { opId: 'rw:abc', creditsDelta: 500 }],
  };
  const a = adoptServerGrants(s, input, known);
  assert.equal(a.cards, 2);
  assert.equal(a.credits, 20000);
  assert.equal(a.state.profile.credits, 22790);
  assert.ok(a.state.inventory.some((o) => o.id === 'sbc_bf_1'));
  assert.ok(!a.state.inventory.some((o) => o.id === 'x1'));
  const b = adoptServerGrants(a.state, input, known);
  assert.equal(b.state, a.state); // idempotente
});

test('não ressuscita carta de concessão já gasta localmente', () => {
  let s = defaultUltimateState();
  const input = { cards: [{ cardId: 'gw_k', cardKey: 'k:legendary', meta: { goodwill: true } }], credits: [] };
  s = adoptServerGrants(s, input, known).state;
  s = { ...s, inventory: s.inventory.filter((o) => o.id !== 'gw_k') };
  assert.equal(adoptServerGrants(s, input, known).cards, 0);
});

test('carta adotada entra no swap "versões online"', () => {
  let s = defaultUltimateState();
  s = grantCard(s, 'dev:elite', 'pack', { id: 'dev1' });
  s = adoptServerGrants(s, { cards: [{ cardId: 'sbc_bf_2', cardKey: 'srv:elite', meta: { backfill: true } }], credits: [] }, known).state;
  const lookup = (k: string) => ({ key: k, playerId: k === 'dev:elite' ? 'p1' : 'p2', role: 'Rifler', ovr: 85 }) as never;
  const moves = bestOnlineSwap([{ slot: 0, ownedId: 'dev1', role: 'Rifler' } as never], s.inventory, new Set(['sbc_bf_2']), ['dev1'], lookup);
  assert.deepEqual(moves, [{ slot: 0, ownedId: 'sbc_bf_2' }]);
});
