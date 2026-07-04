import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeDb } from './ultimate-economy.mock.js';
import { applyUltTransaction } from './ultimate-economy.js';
import {
  ULT_PACK_ENGINE_VERSION,
  buildServerCatalog,
  openPack,
  rollPackServer,
  serverCatalogIndex,
  serverPackDef,
} from './ultimate-pack.js';

const NOW = new Date('2026-07-04T12:00:00Z');

// ------------------------------------------------------------------ catálogo

test('catálogo do servidor é não-vazio, estável e indexável', () => {
  const cat = buildServerCatalog(NOW);
  assert.ok(cat.length > 100, `catálogo muito pequeno: ${cat.length}`);
  // estável: mesma chamada no mesmo mês devolve o mesmo conteúdo
  const again = buildServerCatalog(NOW);
  assert.deepEqual(again.map((c) => c.key), cat.map((c) => c.key));
  // keys únicas → o índice cobre o catálogo inteiro
  const index = serverCatalogIndex(NOW);
  assert.equal(index.size, cat.length);
  // tem os tiers que os packs precisam (senão o fallback distorceria as odds)
  const rarities = new Set(cat.map((c) => c.rarity));
  for (const r of ['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon', 'tots'] as const) {
    assert.ok(rarities.has(r), `catálogo sem tier ${r}`);
  }
});

// ---------------------------------------------------------------------- roll

test('mesma seed + packId ⇒ MESMAS cartas na mesma ordem (determinístico)', () => {
  const catalog = buildServerCatalog(NOW);
  for (const packId of ['bronze', 'silver', 'gold', 'tots', 'premium']) {
    const a = rollPackServer({ packId, seed: 123456789, catalog });
    const b = rollPackServer({ packId, seed: 123456789, catalog });
    assert.ok(a && b);
    assert.deepEqual(a!.map((c) => c.key), b!.map((c) => c.key));
    assert.equal(a!.length, serverPackDef(packId)!.cards);
  }
  // seeds diferentes divergem (prova que a seed manda no roll)
  const s1 = rollPackServer({ packId: 'premium', seed: 1, catalog })!.map((c) => c.key);
  const s2 = rollPackServer({ packId: 'premium', seed: 2, catalog })!.map((c) => c.key);
  assert.notDeepEqual(s1, s2);
});

test('packId desconhecido não rola', () => {
  const catalog = buildServerCatalog(NOW);
  assert.equal(rollPackServer({ packId: 'hackz', seed: 1, catalog }), null);
  assert.equal(serverPackDef('hackz'), undefined);
});

test('odds sanity: pacote bronze N=2000 fica no ballpark dos weights do engine', () => {
  const catalog = buildServerCatalog(NOW);
  const dist: Record<string, number> = {};
  let total = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    for (const c of rollPackServer({ packId: 'bronze', seed, catalog })!) {
      dist[c.rarity] = (dist[c.rarity] ?? 0) + 1;
      total++;
    }
  }
  // weights do bronze: bronze 55 / silver 35 / gold 9 / rareGold 1 + 1 prata
  // garantida por pack ⇒ esperado por carta: bronze ~44%, silver ~48%,
  // gold ~7.2%, rareGold ~0.8%. NUNCA icon/elite/legendary/specials.
  assert.deepEqual(Object.keys(dist).sort(), ['bronze', 'gold', 'rareGold', 'silver']);
  const frac = (r: string) => (dist[r] ?? 0) / total;
  assert.ok(frac('bronze') > 0.35 && frac('bronze') < 0.53, `bronze fora do ballpark: ${frac('bronze')}`);
  assert.ok(frac('silver') > 0.39 && frac('silver') < 0.57, `silver fora do ballpark: ${frac('silver')}`);
  assert.ok(frac('gold') > 0.03 && frac('gold') < 0.13, `gold fora do ballpark: ${frac('gold')}`);
  assert.ok(frac('rareGold') < 0.03, `rareGold fora do ballpark: ${frac('rareGold')}`);
});

test('garantia do pacote TOTS: sempre ao menos 1 carta tots', () => {
  const catalog = buildServerCatalog(NOW);
  for (let seed = 1; seed <= 200; seed++) {
    const cards = rollPackServer({ packId: 'tots', seed, catalog })!;
    assert.ok(cards.some((c) => c.rarity === 'tots'), `seed ${seed} sem tots`);
  }
});

// ------------------------------------------------------------------ packOpen

const EMAIL = 'a@x.com';

async function grant(db: FakeDb, credits: number): Promise<void> {
  const r = await applyUltTransaction(db.sql, EMAIL, { opId: `grant-${credits}`, kind: 'grant', creditsDelta: credits, cards: [] });
  assert.ok(r.ok);
}

test('packOpen debita o custo do ENGINE e grava seed/engineVersion no ledger', async () => {
  const db = new FakeDb();
  await grant(db, 10_000);
  const r = await openPack(db.sql, EMAIL, { opId: 'p1', packId: 'bronze' }, { now: NOW, seed: 42 });
  assert.ok(r.ok && !r.replayed);
  if (!r.ok) return;
  const pack = serverPackDef('bronze')!;
  assert.equal(r.cost, pack.cost);
  assert.equal(r.credits, 10_000 - pack.cost);
  assert.equal(r.seed, 42);
  assert.equal(r.cards.length, pack.cards);
  // cartas inseridas na coleção, apontando pro catálogo
  const index = serverCatalogIndex(NOW);
  const owned = db.cardsOf(EMAIL);
  assert.equal(owned.length, pack.cards);
  for (const c of r.cards) {
    assert.ok(index.has(c.cardKey), `cardKey fora do catálogo: ${c.cardKey}`);
    assert.equal(c.card?.key, c.cardKey);
    assert.ok(owned.some((o) => o.cardId === c.cardId && o.cardKey === c.cardKey));
  }
  // ledger auditável: kind pack, delta negativo, meta com packId/seed/versão
  const row = db.ledger.find((l) => l.opId === 'p1')!;
  assert.equal(row.kind, 'pack');
  assert.equal(row.delta, -pack.cost);
  assert.deepEqual(row.meta, { packId: 'bronze', seed: 42, engineVersion: ULT_PACK_ENGINE_VERSION });
  // reprodutível: re-rolar com a seed do ledger dá as MESMAS cartas
  const audit = rollPackServer({ packId: 'bronze', seed: 42, catalog: buildServerCatalog(NOW) })!;
  assert.deepEqual(r.cards.map((c) => c.cardKey), audit.map((c) => c.key));
});

test('packOpen sem saldo NÃO rola nem debita (caminho 409)', async () => {
  const db = new FakeDb();
  await grant(db, 100);
  const r = await openPack(db.sql, EMAIL, { opId: 'p1', packId: 'bronze' }, { now: NOW });
  assert.deepEqual(r, { ok: false, error: 'insufficient_credits', credits: 100 });
  assert.equal(db.cardsOf(EMAIL).length, 0);
  assert.ok(!db.ledger.some((l) => l.kind === 'pack'));
});

test('replay do mesmo op_id devolve as MESMAS cartas sem re-rolar', async () => {
  const db = new FakeDb();
  await grant(db, 50_000);
  const first = await openPack(db.sql, EMAIL, { opId: 'p1', packId: 'gold' }, { now: NOW, seed: 7 });
  assert.ok(first.ok && !first.replayed);
  // retry com OUTRA seed: se re-rolasse, as cartas mudariam — não podem mudar.
  const retry = await openPack(db.sql, EMAIL, { opId: 'p1', packId: 'gold' }, { now: NOW, seed: 999_999 });
  assert.ok(retry.ok && retry.replayed);
  if (!first.ok || !retry.ok) return;
  assert.deepEqual(retry.cards.map((c) => c.cardId), first.cards.map((c) => c.cardId));
  assert.deepEqual(retry.cards.map((c) => c.cardKey), first.cards.map((c) => c.cardKey));
  assert.equal(retry.seed, 7); // seed reportada é a ORIGINAL do ledger
  assert.equal(retry.credits, first.credits); // não debitou de novo
  assert.equal(db.cardsOf(EMAIL).length, first.cards.length);
  assert.equal(db.ledger.filter((l) => l.kind === 'pack').length, 1);
});

test('op_id já usado por tx de outro kind ⇒ op_conflict (não devolve cartas alheias)', async () => {
  const db = new FakeDb();
  await grant(db, 50_000);
  const ok = await applyUltTransaction(db.sql, EMAIL, { opId: 'op-x', kind: 'spend', creditsDelta: -10, cards: [] });
  assert.ok(ok.ok);
  const r = await openPack(db.sql, EMAIL, { opId: 'op-x', packId: 'bronze' }, { now: NOW });
  assert.deepEqual(r, { ok: false, error: 'op_conflict' });
});

test('packOpen desconhecido não toca no banco', async () => {
  const db = new FakeDb();
  await grant(db, 50_000);
  const r = await openPack(db.sql, EMAIL, { opId: 'p1', packId: 'lulz' }, { now: NOW });
  assert.deepEqual(r, { ok: false, error: 'unknown_pack' });
  assert.ok(!db.ledger.some((l) => l.kind === 'pack'));
});
