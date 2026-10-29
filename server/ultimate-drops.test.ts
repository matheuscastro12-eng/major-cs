// [CSM-1] Drop de escolha: engine puro + fluxo do servidor (store em memória +
// FakeDb do ledger). Calibração da economia no fim (números do doc).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoPickIndex, consumeDrop, dropOptionValue, dropPool, dropStock, nextSinceGold, rollDropOffers,
  DROP_CHOICE_MS, DROP_INTERVAL_MS, DROP_MAX_STOCK, DROP_PITY_N, DROP_WEIGHTS_PPM, type DropCardLike,
} from '../src/engine/ultimate/drops.js';
import { rarityInfo, type UltRarity } from '../src/engine/ultimate/rarities.js';
import { quickSellValue } from '../src/engine/ultimate/quicksell.js';
import { packById, rollPack } from '../src/engine/ultimate/packs.js';
import { makeRng } from '../src/engine/rng.js';
import { FakeDb } from './ultimate-economy.mock.js';
import { dropOpen, dropOpId, dropPick, dropStatus, memoryDropStore, type DropCatalog } from './ultimate-drops.js';
import { buildServerCatalog, serverDropCatalog } from './ultimate-pack.js';

const EMAIL = 'a@b.com';
const T0 = Date.UTC(2026, 6, 7, 12, 0, 0); // terça (sem evento)

// catálogo pequeno e determinístico
function mk(i: number, rarity: UltRarity, ovr: number): DropCardLike & { nick: string } {
  return { key: `p${i}:${rarity}`, playerId: `p${i}`, rarity, ovr, nick: `P${i}` };
}
const SMALL: (DropCardLike & { nick: string })[] = [
  ...Array.from({ length: 12 }, (_, i) => mk(i, 'bronze', 60 + (i % 7))),
  ...Array.from({ length: 12 }, (_, i) => mk(100 + i, 'silver', 68 + (i % 6))),
  ...Array.from({ length: 8 }, (_, i) => mk(200 + i, 'gold', 74 + (i % 6))),
  ...Array.from({ length: 4 }, (_, i) => mk(300 + i, 'rareGold', 80 + i)),
  mk(400, 'elite', 85), mk(500, 'legendary', 89), mk(600, 'icon', 93), mk(700, 'tots', 95),
];
const byKey = new Map(SMALL.map((c) => [c.key, c] as const));
const CAT: DropCatalog = { pool: () => dropPool(SMALL), lookup: (k) => byKey.get(k), eventId: () => null };

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

test('pesos somam 1 milhão e Ícone/specials ficam fora do pool', () => {
  assert.equal(DROP_WEIGHTS_PPM.reduce((a, [, w]) => a + w, 0), 1_000_000);
  const pool = dropPool(SMALL);
  assert.ok(!pool.some((c) => c.rarity === 'icon' || c.rarity === 'tots'));
});

test('estoque: 1 a cada 20 min, teto 3, excedente perdido, saque preserva a fração', () => {
  const s0 = { available: 0, refillBase: T0 };
  assert.equal(dropStock(s0, T0 + DROP_INTERVAL_MS - 1).available, 0);
  assert.equal(dropStock(s0, T0 + DROP_INTERVAL_MS).available, 1);
  assert.equal(dropStock(s0, T0 + 10 * DROP_INTERVAL_MS).available, DROP_MAX_STOCK);
  assert.equal(dropStock(s0, T0 + 10 * DROP_INTERVAL_MS).nextAt, null);
  // 1 drop + 5 min de fração: depois do saque o próximo sai em 15 min
  const after = consumeDrop(s0, T0 + DROP_INTERVAL_MS + 5 * 60_000)!;
  assert.equal(after.available, 0);
  assert.equal(dropStock(after, T0 + DROP_INTERVAL_MS + 5 * 60_000).nextAt, T0 + 2 * DROP_INTERVAL_MS);
  // cheio: o relógio recomeça no saque (não devolve tempo perdido)
  const full = consumeDrop(s0, T0 + 10 * DROP_INTERVAL_MS)!;
  assert.equal(full.available, 2);
  assert.equal(full.refillBase, T0 + 10 * DROP_INTERVAL_MS);
  assert.equal(consumeDrop({ available: 0, refillBase: T0 }, T0), null);
});

test('sorteio: determinístico pela seed, 3 opções distintas, ordem do pool não importa', () => {
  const a = rollDropOffers(1234, dropPool(SMALL), 0);
  const b = rollDropOffers(1234, [...dropPool(SMALL)].reverse(), 0);
  assert.deepEqual(a.offers.map((c) => c.key), b.offers.map((c) => c.key));
  assert.equal(a.offers.length, 3);
  assert.equal(new Set(a.offers.map((c) => c.playerId)).size, 3);
});

test('pity: com sinceGold = N-1 a 1ª opção é Ouro+ em qualquer seed', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rollDropOffers(seed, dropPool(SMALL), DROP_PITY_N - 1);
    assert.ok(r.pityUsed);
    assert.ok(rarityInfo(r.offers[0].rarity).tier >= rarityInfo('gold').tier, `seed ${seed}`);
    assert.equal(nextSinceGold(DROP_PITY_N - 1, r), 0);
  }
  assert.equal(nextSinceGold(3, { hasGoldPlus: false }), 4);
});

test('vencimento entrega a opção de MENOR valor', () => {
  const offers = [mk(1, 'gold', 78), mk(2, 'bronze', 61), mk(3, 'silver', 70)];
  assert.equal(autoPickIndex(offers), 1);
  assert.ok(dropOptionValue(offers[1]) < dropOptionValue(offers[2]));
});

test('fluxo: conta nova abre, escolhe; carta entra pelo ledger com op_id drop:<id>', async () => {
  const db = new FakeDb(); const store = memoryDropStore();
  const st = await dropStatus(store, db.sql, EMAIL, CAT, { now: T0 });
  assert.ok(st.ok && st.value.available === 1 && st.value.pending === null);
  const o = await dropOpen(store, db.sql, EMAIL, CAT, { now: T0, seed: 99, uuid });
  assert.ok(o.ok && o.value.opened && o.value.pending);
  if (!o.ok || !o.value.pending) return;
  assert.equal(o.value.available, 0);
  assert.equal(o.value.pending.offers.length, 3);
  assert.equal(o.value.pending.expiresAt, T0 + DROP_CHOICE_MS);
  // abrir de novo devolve o MESMO pendente sem consumir
  const again = await dropOpen(store, db.sql, EMAIL, CAT, { now: T0 + 1000, seed: 7, uuid });
  assert.ok(again.ok && !again.value.opened);
  if (!again.ok) return;
  assert.equal(again.value.pending?.dropId, o.value.pending.dropId);
  const dropId = o.value.pending.dropId;
  const p = await dropPick(store, db.sql, EMAIL, { dropId, index: 2 }, CAT, { now: T0 + 60_000, uuid });
  assert.ok(p.ok && !p.value.replayed && !p.value.auto && p.value.index === 2);
  if (!p.ok) return;
  assert.equal(p.value.cardKey, o.value.pending.offers[2].cardKey);
  assert.equal(db.cardsOf(EMAIL).length, 1);
  const led = db.ledger.find((l) => l.opId === dropOpId(dropId))!;
  assert.equal(led.kind, 'grant');
  assert.equal((led.meta as { seed: number }).seed, 99);
  // replay com OUTRO índice devolve o resultado gravado, sem 2ª carta
  const re = await dropPick(store, db.sql, EMAIL, { dropId, index: 0 }, CAT, { now: T0 + 61_000, uuid });
  assert.ok(re.ok && re.value.replayed && re.value.index === 2 && re.value.cardKey === p.value.cardKey);
  assert.equal(db.cardsOf(EMAIL).length, 1);
  // sem estoque
  const none = await dropOpen(store, db.sql, EMAIL, CAT, { now: T0 + 62_000, uuid });
  assert.ok(!none.ok && none.status === 409);
});

test('janela vencida: pick ignora o índice e o status liquida sozinho (menor valor, uma vez só)', async () => {
  const db = new FakeDb(); const store = memoryDropStore();
  const o = await dropOpen(store, db.sql, EMAIL, CAT, { now: T0, seed: 5, uuid });
  assert.ok(o.ok && o.value.pending);
  if (!o.ok || !o.value.pending) return;
  const auto = o.value.pending.autoIndex;
  const late = T0 + DROP_CHOICE_MS + 1;
  const st = await dropStatus(store, db.sql, EMAIL, CAT, { now: late, uuid });
  assert.ok(st.ok && st.value.settled && st.value.settled.auto && st.value.settled.index === auto);
  assert.ok(st.ok && st.value.pending === null);
  const p = await dropPick(store, db.sql, EMAIL, { dropId: o.value.pending.dropId, index: (auto + 1) % 3 }, CAT, { now: late, uuid });
  assert.ok(p.ok && p.value.replayed && p.value.index === auto);
  assert.equal(db.cardsOf(EMAIL).length, 1);
});

test('pick de índice inválido = 400 e não entrega nada', async () => {
  const db = new FakeDb(); const store = memoryDropStore();
  const o = await dropOpen(store, db.sql, EMAIL, CAT, { now: T0, seed: 5, uuid });
  if (!o.ok || !o.value.pending) return assert.fail();
  const p = await dropPick(store, db.sql, EMAIL, { dropId: o.value.pending.dropId, index: 3 }, CAT, { now: T0, uuid });
  assert.ok(!p.ok && p.status === 400);
  assert.equal(db.cardsOf(EMAIL).length, 0);
});

test('pool insuficiente recusa SEM consumir estoque', async () => {
  const db = new FakeDb(); const store = memoryDropStore();
  const tiny: DropCatalog = { pool: () => [mk(1, 'bronze', 60)], lookup: () => undefined, eventId: () => null };
  const o = await dropOpen(store, db.sql, EMAIL, tiny, { now: T0, seed: 1, uuid });
  assert.ok(!o.ok && o.status === 503);
  const st = await dropStatus(store, db.sql, EMAIL, CAT, { now: T0 });
  assert.ok(st.ok && st.value.available === 1);
});

test('catálogo REAL do servidor: abre e resolve as 3 opções', async () => {
  const db = new FakeDb(); const store = memoryDropStore();
  const cat = serverDropCatalog();
  const o = await dropOpen(store, db.sql, EMAIL, cat, { now: T0, seed: 2026, uuid });
  assert.ok(o.ok && o.value.pending);
  if (!o.ok || !o.value.pending) return;
  for (const off of o.value.pending.offers) assert.ok(off.card, off.cardKey);
});

// ── calibração: números que estão em docs/ultimate-online/drops-calibracao.md
test('calibração: EV da melhor opção do drop << EV de uma carta do Pacote Bronze', () => {
  const now = new Date(T0);
  const catalog = buildServerCatalog(now);
  const pool = dropPool(catalog);
  const N = 20_000;
  let evBest = 0, evAuto = 0, goldPlus = 0, pity = 0, since = 0;
  for (let s = 1; s <= N; s++) {
    // sequência real: o contador de pity anda entre drops
    const r = rollDropOffers(s, pool, since);
    since = nextSinceGold(since, r);
    if (r.pityUsed) pity++;
    const vals = r.offers.map(dropOptionValue);
    evBest += Math.max(...vals);
    evAuto += Math.min(...vals);
    if (r.hasGoldPlus) goldPlus++;
  }
  evBest /= N; evAuto /= N;
  const bronze = packById('bronze')!;
  let evPackCard = 0; let packs = 0;
  for (let s = 1; s <= 4000; s++) {
    const cards = rollPack(catalog, bronze, makeRng(s));
    for (const c of cards) evPackCard += quickSellValue(c.rarity, c.ovr, false);
    packs++;
  }
  const evPack = evPackCard / packs;
  evPackCard /= packs * bronze.cards;
  console.log(`[calibração] drop melhor=${evBest.toFixed(1)} menor=${evAuto.toFixed(1)} P(Ouro+)=${(goldPlus / N * 100).toFixed(1)}% pity=${(pity / N * 100).toFixed(1)}% | bronze: por carta=${evPackCard.toFixed(1)} por pack=${evPack.toFixed(1)} custo=${bronze.cost}`);
  // drop (grátis) vale no máximo ~1 carta do Pacote Bronze (o mais barato)
  assert.ok(evBest <= evPackCard * 1.25, 'drop não pode valer mais que ~1 carta do pack mais barato');
  // uso pesado realista (8 h online = 24 drops) fica abaixo do diário médio da semana (22300/7)
  assert.ok(evBest * 24 < 22_300 / 7, 'drop passivo não pode virar torneira');
});
