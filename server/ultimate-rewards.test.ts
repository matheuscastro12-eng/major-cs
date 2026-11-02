// [UT-REW] prêmios de carta autoritativos + cura da ranqueada
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServerCatalog, serverCardByKeyAnyMonth } from './ultimate-pack.js';
import { healOpId, justifiedSbcSlots, planObjective, planSbc, planSbcHeal, type LedgerRow, type RewardDeps } from './ultimate-rewards.js';
import { sbcById } from '../src/engine/ultimate/sbc.js';
import { bestOnlineSwap } from '../src/engine/ultimate/onlineSwap.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';

const cat = buildServerCatalog(new Date('2026-11-02T12:00:00Z'));
const lookup = (k: string) => serverCardByKeyAnyMonth(k) ?? null;
let n = 0;
const deps: RewardDeps = { lookup, pool: (r) => cat.filter((c) => c.rarity === r), rng: () => 0, uuid: () => `u${++n}` };

// 5 Ouro Raro de jogadores distintos (insumo da 'rare-five' → Elite)
function rareFive(): UltCard[] {
  const seen = new Set<string>(); const out: UltCard[] = [];
  for (const c of cat) if (c.rarity === 'rareGold' && !seen.has(c.playerId) && out.length < 5) { seen.add(c.playerId); out.push(c); }
  assert.equal(out.length, 5);
  return out;
}

test('SBC: insumos do servidor + requisitos ok → remove 5, adiciona o prêmio da raridade certa', () => {
  const ins = rareFive();
  const owned = ins.map((c, i) => ({ cardId: `c${i}`, cardKey: c.key }));
  const r = planSbc(sbcById('rare-five'), owned.map((o) => o.cardId), owned, deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.cards.filter((c) => c.op === 'remove').length, 5);
  assert.equal(r.requireOwned.length, 5);
  assert.ok(r.reward && /^sbc_/.test(r.reward.cardId));
  assert.equal(lookup(r.reward!.cardKey)?.rarity, 'elite');
});

test('SBC: carta que o servidor não conhece → not_owner (nada de prêmio)', () => {
  const ins = rareFive();
  const owned = ins.slice(0, 4).map((c, i) => ({ cardId: `c${i}`, cardKey: c.key }));
  const r = planSbc(sbcById('rare-five'), ['c0', 'c1', 'c2', 'c3', 'fake'], owned, deps);
  assert.deepEqual(r, { ok: false, error: 'not_owner' });
});

test('SBC: requisito furado (raridade errada / repetida / sbc inexistente) é recusado', () => {
  const ins = rareFive();
  const wrong = cat.find((c) => c.rarity === 'elite')!;
  const owned = [...ins.slice(0, 4), wrong].map((c, i) => ({ cardId: `c${i}`, cardKey: c.key }));
  assert.deepEqual(planSbc(sbcById('rare-five'), owned.map((o) => o.cardId), owned, deps), { ok: false, error: 'requirements' });
  assert.deepEqual(planSbc(sbcById('rare-five'), ['c0', 'c0'], owned, deps), { ok: false, error: 'duplicate_ids' });
  assert.deepEqual(planSbc(sbcById('nope'), ['c0'], owned, deps), { ok: false, error: 'unknown_sbc' });
});

test('objetivo: só com métrica conferível e meta atingida no servidor', () => {
  const facts = { uniqueCards: 70, totalCards: 80, iconsOwned: 0, histIconsOwned: 0, wins: 3 };
  const ok = planObjective('unique-60', facts, deps);
  assert.ok(ok.ok && lookup(ok.card.cardKey)?.rarity === 'elite');
  assert.deepEqual(planObjective('unique-60', { ...facts, uniqueCards: 10 }, deps), { ok: false, error: 'not_reached' });
  assert.deepEqual(planObjective('win-20', facts, deps), { ok: false, error: 'not_reached' });
  assert.deepEqual(planObjective('open-5', facts, deps), { ok: false, error: 'no_card_reward' });
});

function ledgerWithSbc(ins: UltCard[], extra: Partial<LedgerRow> = {}): LedgerRow[] {
  return [
    { id: 1, opId: 'import:x', kind: 'grant', meta: {}, cards: ins.map((c, i) => ({ op: 'add', cardId: `c${i}`, cardKey: c.key })) },
    { id: 2, opId: 'q1', kind: 'sbc', meta: { sbcId: 'rare-five' }, cards: ins.map((_, i) => ({ op: 'remove', cardId: `c${i}` })), ...extra },
  ];
}

test('cura: SBC antiga com insumos do ledger vira 1 vaga Elite; carta sbc_ do aparelho entra 1×', () => {
  const ins = rareFive();
  const slots = justifiedSbcSlots(ledgerWithSbc(ins), lookup);
  assert.deepEqual(slots, [{ ledgerId: 2, sbcId: 'rare-five', rarity: 'elite' }]);
  const elite = cat.filter((c) => c.rarity === 'elite');
  const plan = planSbcHeal([{ cardId: 'sbc_a', cardKey: elite[0].key }, { cardId: 'sbc_b', cardKey: elite[1].key }], slots, new Set(), lookup);
  assert.deepEqual(plan.map((p) => p.cardId), ['sbc_a'], 'uma SBC justifica UMA carta (sem prêmio dobrado)');
  // já curada → sem vaga
  const healed = [...ledgerWithSbc(ins), { id: 3, opId: healOpId(2), kind: 'grant', meta: {}, cards: [] }];
  assert.deepEqual(justifiedSbcSlots(healed, lookup), []);
});

test('cura: SBC com insumo que nunca entrou no servidor, ou já premiada, não justifica nada', () => {
  const ins = rareFive();
  const led = ledgerWithSbc(ins);
  led[0].cards = led[0].cards.slice(0, 4);
  assert.deepEqual(justifiedSbcSlots(led, lookup), []);
  assert.deepEqual(justifiedSbcSlots(ledgerWithSbc(ins, { meta: { sbcId: 'rare-five', rewarded: true } }), lookup), []);
  // raridade diferente da do prêmio, ou id sem prefixo sbc_, não casa
  const slots = justifiedSbcSlots(ledgerWithSbc(ins), lookup);
  const icon = cat.find((c) => c.rarity === 'icon')!;
  assert.deepEqual(planSbcHeal([{ cardId: 'sbc_x', cardKey: icon.key }, { cardId: 'obj_y', cardKey: cat.find((c) => c.rarity === 'elite')!.key }], slots, new Set(), lookup), []);
});

test('trocar pelas melhores online: só cópias do servidor, mesma função primeiro, sem jogador repetido', () => {
  const pool = cat.filter((c) => c.rarity === 'gold' || c.rarity === 'rareGold').slice(0, 40);
  const inv = pool.map((c, i) => ({ id: `o${i}`, cardKey: c.key }));
  const slots = inv.slice(0, 5).map((o, i) => ({ slot: i, ownedId: o.id, role: lookup(o.cardKey)!.role }));
  const server = new Set(inv.slice(1).map((o) => o.id)); // o0 é só do aparelho
  const moves = bestOnlineSwap(slots, inv, server, ['o0'], (k) => lookup(k) ?? undefined);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].slot, 0);
  assert.ok(server.has(moves[0].ownedId) && !slots.some((s) => s.ownedId === moves[0].ownedId));
});
