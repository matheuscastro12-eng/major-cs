// Testes do mercado P2P do Ultimate (fase A — servidor) sobre a FakeDb.
import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateCardValue, type UltCard } from '../src/engine/ultimate/cards.js';
import { isSpecial } from '../src/engine/ultimate/rarities.js';
import { FakeDb } from './ultimate-economy.mock.js';
import {
  MKT_BROWSE_CAP,
  MKT_MAX_ACTIVE_LISTINGS,
  browseListings,
  buyListing,
  cancelListing,
  expireListings,
  listCard,
  mktPriceBounds,
  mktSellerProceeds,
  myListings,
  ultMarketSchemaQueries,
} from './ultimate-market.js';
import { buildServerCatalog } from './ultimate-pack.js';

const SELLER = 'seller@x.com';
const BUYER = 'buyer@x.com';

const catalog = buildServerCatalog();
// lookup injetado (hotfix do import runtime): mesmo shape que o
// server/ultimate-catalog-lazy.ts produz, construído do catálogo real.
const LOOKUP = (cardKey: string) => {
  const c = catalog.find((x) => x.key === cardKey);
  if (!c) return null;
  return { ovr: c.ovr, rarity: c.rarity, value: estimateCardValue(c.ovr, c.rarity), special: isSpecial(c.rarity) };
};
const normalCard = (): UltCard => {
  const c = catalog.find((x) => !isSpecial(x.rarity) && x.ovr >= 74);
  assert.ok(c, 'catálogo precisa ter carta normal');
  return c!;
};
const specialCard = (): UltCard => {
  const c = catalog.find((x) => isSpecial(x.rarity));
  assert.ok(c, 'catálogo precisa ter carta especial');
  return c!;
};

function giveCard(db: FakeDb, email: string, cardId: string, card: UltCard, meta: Record<string, unknown> = {}) {
  db.cardsOf(email).push({ cardId, cardKey: card.key, meta, acquiredAt: new Date().toISOString() });
}

async function listOk(db: FakeDb, card: UltCard, cardId = 'copy-1', price?: number) {
  giveCard(db, SELLER, cardId, card, { boost: 2 });
  const p = price ?? estimateCardValue(card.ovr, card.rarity);
  const r = await listCard(db.sql, SELLER, { cardId, price: p }, LOOKUP);
  assert.ok(r.ok, `list falhou: ${JSON.stringify(r)}`);
  return { listingId: r.ok ? r.listingId : 0, price: p };
}

// --------------------------------------------------------------------- schema

test('schema cria rtm_ult_listings com índices de status e vendedor', () => {
  const db = new FakeDb();
  const texts = ultMarketSchemaQueries(db.sql).map((q) => (q as unknown as { text: string }).text);
  assert.equal(texts.length, 3);
  assert.ok(texts[0].includes('rtm_ult_listings') && texts[0].includes("status IN ('active','sold','cancelled','expired')"));
  assert.ok(texts[1].includes('(status, card_key)'));
  assert.ok(texts[2].includes('(seller_email, status)'));
});

// ---------------------------------------------------------------------- list

test('listCard escrowa a carta: sai da coleção, listagem ativa, ledger escrow', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const { listingId, price } = await listOk(db, card);
  assert.equal(db.cardsOf(SELLER).length, 0); // custódia
  const l = db.listings.find((x) => x.id === listingId)!;
  assert.equal(l.status, 'active');
  assert.equal(l.price, price);
  assert.equal(l.cardKey, card.key);
  assert.deepEqual(l.cardMeta, { boost: 2 }); // meta preservado pro comprador
  const led = db.ledger.find((x) => x.email === SELLER && x.opId === `mkt-list:${listingId}`)!;
  assert.equal(led.kind, 'escrow');
  assert.equal(led.delta, 0);
  assert.equal((led.meta as { listingId?: number }).listingId, listingId);
  assert.deepEqual(led.cards, [{ op: 'remove', cardId: 'copy-1' }]);
});

test('listCard rejeita carta que não é do vendedor', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const r = await listCard(db.sql, SELLER, { cardId: 'nao-tenho', price: estimateCardValue(card.ovr, card.rarity) }, LOOKUP);
  assert.deepEqual(r, { ok: false, error: 'not_owner' });
});

test('listCard rejeita especiais (tots/major/promo)', async () => {
  const db = new FakeDb();
  const card = specialCard();
  giveCard(db, SELLER, 'sp-1', card);
  const r = await listCard(db.sql, SELLER, { cardId: 'sp-1', price: estimateCardValue(card.ovr, card.rarity) }, LOOKUP);
  assert.deepEqual(r, { ok: false, error: 'special_not_listable' });
  assert.equal(db.cardsOf(SELLER).length, 1); // nada escrowado
});

test('listCard prende o preço a 0.5×..3× do estimateCardValue', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const value = estimateCardValue(card.ovr, card.rarity);
  const bounds = mktPriceBounds({ value: estimateCardValue(card.ovr, card.rarity) });
  assert.equal(bounds.min, Math.max(1, Math.ceil(value * 0.5)));
  assert.equal(bounds.max, Math.floor(value * 3));

  giveCard(db, SELLER, 'c1', card);
  const low = await listCard(db.sql, SELLER, { cardId: 'c1', price: bounds.min - 1 }, LOOKUP);
  assert.ok(!low.ok && low.error === 'invalid_price' && low.min === bounds.min && low.max === bounds.max);
  const high = await listCard(db.sql, SELLER, { cardId: 'c1', price: bounds.max + 1 }, LOOKUP);
  assert.ok(!high.ok && high.error === 'invalid_price');
  const zero = await listCard(db.sql, SELLER, { cardId: 'c1', price: 0 }, LOOKUP);
  assert.ok(!zero.ok && zero.error === 'invalid_price');
  const edge = await listCard(db.sql, SELLER, { cardId: 'c1', price: bounds.max }, LOOKUP);
  assert.ok(edge.ok); // limites inclusivos
});

test('listCard aplica cap de 10 listagens ativas por vendedor', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const price = estimateCardValue(card.ovr, card.rarity);
  for (let i = 0; i < MKT_MAX_ACTIVE_LISTINGS; i++) {
    giveCard(db, SELLER, `c${i}`, card);
    const r = await listCard(db.sql, SELLER, { cardId: `c${i}`, price }, LOOKUP);
    assert.ok(r.ok, `listagem ${i} deveria passar`);
  }
  giveCard(db, SELLER, 'c-extra', card);
  const r = await listCard(db.sql, SELLER, { cardId: 'c-extra', price }, LOOKUP);
  assert.deepEqual(r, { ok: false, error: 'listing_cap', cap: MKT_MAX_ACTIVE_LISTINGS });
  // cancelar uma libera espaço
  await cancelListing(db.sql, SELLER, { listingId: 1 });
  const r2 = await listCard(db.sql, SELLER, { cardId: 'c-extra', price }, LOOKUP);
  assert.ok(r2.ok);
});

// ----------------------------------------------------------------------- buy

test('buyListing liquida atômico: -price no comprador, +ceil(95%) no vendedor, 5% queimam', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const { listingId, price } = await listOk(db, card);
  db.wallets.set(BUYER, price + 123);

  const r = await buyListing(db.sql, BUYER, { listingId });
  assert.ok(r.ok && !r.replayed);
  if (!r.ok) return;
  const proceeds = mktSellerProceeds(price);
  assert.equal(proceeds, Math.ceil(price * 0.95));
  assert.equal(r.credits, 123);
  assert.equal(db.wallets.get(BUYER), 123);
  assert.equal(db.wallets.get(SELLER), proceeds);
  assert.ok(price - proceeds >= 0); // taxa queimada (sink): soma dos deltas < 0

  // carta foi pro comprador com o meta original preservado
  const bought = db.cardsOf(BUYER).find((c) => c.cardId === 'copy-1')!;
  assert.equal(bought.cardKey, card.key);
  assert.equal(bought.meta.boost, 2);
  assert.equal(bought.meta.acquiredVia, 'market');

  // as DUAS pernas no ledger, kind 'trade', com listingId no meta
  const buyerLeg = db.ledger.find((l) => l.email === BUYER && l.opId === `mkt-buy:${listingId}`)!;
  assert.equal(buyerLeg.kind, 'trade');
  assert.equal(buyerLeg.delta, -price);
  assert.equal((buyerLeg.meta as { listingId?: number }).listingId, listingId);
  const sellerLeg = db.ledger.find((l) => l.email === SELLER && l.opId === `mkt-sold:${listingId}`)!;
  assert.equal(sellerLeg.kind, 'trade');
  assert.equal(sellerLeg.delta, proceeds);
  assert.equal((sellerLeg.meta as { tax?: number }).tax, price - proceeds);

  const listing = db.listings.find((l) => l.id === listingId)!;
  assert.equal(listing.status, 'sold');
  assert.equal(listing.buyerEmail, BUYER);
  assert.ok(listing.soldAt);
});

test('buyListing rejeita comprar de si mesmo', async () => {
  const db = new FakeDb();
  const { listingId, price } = await listOk(db, normalCard());
  db.wallets.set(SELLER, price * 2);
  const r = await buyListing(db.sql, SELLER, { listingId });
  assert.deepEqual(r, { ok: false, error: 'self_buy' });
});

test('buyListing rejeita saldo insuficiente sem tocar em nada', async () => {
  const db = new FakeDb();
  const { listingId, price } = await listOk(db, normalCard());
  db.wallets.set(BUYER, price - 1);
  const r = await buyListing(db.sql, BUYER, { listingId });
  assert.ok(!r.ok && r.error === 'insufficient_credits' && r.credits === price - 1);
  assert.equal(db.listings[0].status, 'active');
  assert.equal(db.cardsOf(BUYER).length, 0);
});

test('buyListing: segunda compra é bloqueada; replay do mesmo comprador é idempotente', async () => {
  const db = new FakeDb();
  const { listingId, price } = await listOk(db, normalCard());
  db.wallets.set(BUYER, price);
  db.wallets.set('other@x.com', price * 2);

  const first = await buyListing(db.sql, BUYER, { listingId });
  assert.ok(first.ok && !first.replayed);

  // outro comprador: listagem já vendida
  const second = await buyListing(db.sql, 'other@x.com', { listingId });
  assert.deepEqual(second, { ok: false, error: 'not_active' });

  // retry do MESMO comprador: replay, sem novo débito
  const replay = await buyListing(db.sql, BUYER, { listingId });
  assert.ok(replay.ok && replay.replayed);
  assert.equal(db.wallets.get(BUYER), 0); // só debitou uma vez
  assert.equal(db.ledger.filter((l) => l.email === BUYER && l.opId === `mkt-buy:${listingId}`).length, 1);
});

test('buyListing rejeita listagem inexistente', async () => {
  const db = new FakeDb();
  assert.deepEqual(await buyListing(db.sql, BUYER, { listingId: 999 }), { ok: false, error: 'not_found' });
  assert.deepEqual(await buyListing(db.sql, BUYER, { listingId: -1 }), { ok: false, error: 'not_found' });
});

// -------------------------------------------------------------- cancel/expire

test('cancelListing devolve a carta via ledger escrow', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const { listingId } = await listOk(db, card);
  const r = await cancelListing(db.sql, SELLER, { listingId });
  assert.ok(r.ok);
  assert.equal(db.listings[0].status, 'cancelled');
  const back = db.cardsOf(SELLER).find((c) => c.cardId === 'copy-1')!;
  assert.equal(back.cardKey, card.key);
  assert.deepEqual(back.meta, { boost: 2 });
  const led = db.ledger.find((l) => l.email === SELLER && l.opId === `mkt-cancel:${listingId}`)!;
  assert.equal(led.kind, 'escrow');
  assert.deepEqual(led.cards, [{ op: 'add', cardId: 'copy-1', cardKey: card.key, meta: { boost: 2 } }]);
});

test('cancelListing: só o vendedor, e só listagem ativa', async () => {
  const db = new FakeDb();
  const { listingId, price } = await listOk(db, normalCard());
  assert.deepEqual(await cancelListing(db.sql, BUYER, { listingId }), { ok: false, error: 'not_found' });
  db.wallets.set(BUYER, price);
  await buyListing(db.sql, BUYER, { listingId });
  assert.deepEqual(await cancelListing(db.sql, SELLER, { listingId }), { ok: false, error: 'not_active' });
});

test('expiração lazy: listagem vencida some do browse e a carta volta', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const { listingId } = await listOk(db, card);
  db.listings[0].expiresAt = new Date(Date.now() - 1000).toISOString(); // força vencimento
  const listings = await browseListings(db.sql); // qualquer leitura expira antes
  assert.equal(listings.length, 0);
  assert.equal(db.listings[0].status, 'expired');
  assert.ok(db.cardsOf(SELLER).some((c) => c.cardId === 'copy-1'));
  const led = db.ledger.find((l) => l.opId === `mkt-expire:${listingId}`)!;
  assert.equal(led.kind, 'escrow');
  // expirar de novo é no-op (op_id idempotente)
  assert.equal(await expireListings(db.sql), 0);
});

// -------------------------------------------------------------------- browse

test('browseListings filtra por carta/preço e ordena por preço', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const value = estimateCardValue(card.ovr, card.rarity);
  await listOk(db, card, 'a', value + 50);
  await listOk(db, card, 'b', value - 50);
  await listOk(db, card, 'c', value);

  const all = await browseListings(db.sql);
  assert.deepEqual(all.map((l) => l.price), [value - 50, value, value + 50]); // barata primeiro
  assert.equal(all[0].cardKey, card.key);

  const capped = await browseListings(db.sql, { maxPrice: value });
  assert.deepEqual(capped.map((l) => l.price), [value - 50, value]);

  const byKey = await browseListings(db.sql, { cardKey: 'chave-que-nao-existe' });
  assert.equal(byKey.length, 0);

  const newest = await browseListings(db.sql, { sort: 'new' });
  assert.equal(newest.length, 3);
});

test('browse/mine respeitam caps (50/30) e mine traz todas as situações', async () => {
  const db = new FakeDb();
  const card = normalCard();
  const price = estimateCardValue(card.ovr, card.rarity);
  // 60 listagens ativas de vendedores distintos (cap por vendedor é 10)
  for (let i = 0; i < 60; i++) {
    db.listings.push({
      id: db.nextListingId++, sellerEmail: `s${i}@x.com`, cardId: `id${i}`, cardKey: card.key,
      cardMeta: {}, price: price + i, status: 'active',
      createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      buyerEmail: null, soldAt: null,
    });
  }
  const rows = await browseListings(db.sql);
  assert.equal(rows.length, MKT_BROWSE_CAP);

  const { listingId } = await listOk(db, card);
  await cancelListing(db.sql, SELLER, { listingId });
  const mine = await myListings(db.sql, SELLER);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, 'cancelled'); // todas as situações, não só ativas
});

test('listCard sem catálogo (lookup null) recusa com catalog_unavailable e não toca nada', async () => {
  const db = new FakeDb();
  const card = normalCard();
  giveCard(db, SELLER, 'c-nolookup', card);
  const r = await listCard(db.sql, SELLER, { cardId: 'c-nolookup', price: 1000 }, null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, 'catalog_unavailable');
  assert.equal(db.cardsOf(SELLER).length, 1); // carta continua com o vendedor
});
