import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeDb } from './ultimate-economy.mock.js';
import {
  ULT_TX_MAX_CARDS,
  applyClientUltTx,
  applyUltTransaction,
  checkClientUltTx,
  getUltState,
  isUltWalletFrozen,
  ultEconomySchemaQueries,
  ultFrozenMessage,
  validateUltTx,
  type UltQuicksellValuer,
  type UltTx,
} from './ultimate-economy.js';


const tx = (partial: Partial<UltTx> & { opId: string }): UltTx => ({
  kind: 'grant',
  creditsDelta: 0,
  cards: [],
  ...partial,
});

// ------------------------------------------------------------- validateUltTx

test('validateUltTx aceita tx bem formada e normaliza', () => {
  const r = validateUltTx({
    opId: ' op-1 ',
    kind: 'pack',
    creditsDelta: -500,
    cards: [{ op: 'add', cardId: 'c1', cardKey: 'p9:base', meta: { boost: 0 } }],
    meta: { packId: 'gold' },
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.tx.opId, 'op-1');
    assert.equal(r.tx.kind, 'pack');
    assert.equal(r.tx.creditsDelta, -500);
    assert.equal(r.tx.cards.length, 1);
    assert.equal(r.tx.cards[0].cardKey, 'p9:base');
  }
});

test('validateUltTx rejeita payloads malformados', () => {
  assert.equal(validateUltTx(null).ok, false);
  assert.equal(validateUltTx('x').ok, false);
  assert.equal(validateUltTx({ opId: '', kind: 'grant' }).ok, false);
  assert.equal(validateUltTx({ opId: 'x'.repeat(65), kind: 'grant' }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'hack' }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'grant', creditsDelta: 1.5 }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'grant', creditsDelta: Number.NaN }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'grant', creditsDelta: 2 ** 60 }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'grant', cards: 'nope' }).ok, false);
});

test('validateUltTx limita cartas e exige cardKey no add', () => {
  const many = Array.from({ length: ULT_TX_MAX_CARDS + 1 }, (_, i) => ({ op: 'add', cardId: `c${i}`, cardKey: 'k' }));
  assert.equal(validateUltTx({ opId: 'a', kind: 'pack', cards: many }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'pack', cards: [{ op: 'add', cardId: 'c1' }] }).ok, false);
  assert.equal(validateUltTx({ opId: 'a', kind: 'quicksell', cards: [{ op: 'remove', cardId: 'c1' }] }).ok, true);
  assert.equal(
    validateUltTx({ opId: 'a', kind: 'pack', cards: [{ op: 'add', cardId: 'c1', cardKey: 'k' }, { op: 'remove', cardId: 'c1' }] }).ok,
    false, // cardId repetido na mesma tx
  );
  assert.equal(validateUltTx({ opId: 'a', kind: 'pack', cards: [{ op: 'burn', cardId: 'c1' }] }).ok, false);
});

// -------------------------------------------------------------------- schema

test('schema cria wallet, cards e ledger com UNIQUE(email, op_id)', () => {
  const db = new FakeDb();
  const queries = ultEconomySchemaQueries(db.sql);
  assert.equal(queries.length, 5);
  const texts = queries.map((q) => (q as unknown as { text: string }).text);
  // [O0-02] congelamento como coluna aditiva e idempotente
  assert.ok(texts[4].includes('ADD COLUMN IF NOT EXISTS frozen_at'));
  assert.ok(texts[0].includes('rtm_ult_wallet') && texts[0].includes('credits >= 0'));
  assert.ok(texts[1].includes('rtm_ult_cards') && texts[1].includes('PRIMARY KEY (email, card_id)'));
  assert.ok(texts[2].includes('rtm_ult_ledger') && texts[2].includes('UNIQUE (email, op_id)'));
});

// --------------------------------------------------------- applyUltTransaction

test('grant credita e registra no ledger', async () => {
  const db = new FakeDb();
  const r = await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 1000 }));
  assert.deepEqual(r, { ok: true, replayed: false, credits: 1000 });
  assert.equal(db.ledger.length, 1);
  assert.equal(db.wallets.get('a@x.com'), 1000);
});

test('replay do mesmo op_id NÃO re-aplica (idempotente)', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 1000 }));
  const r2 = await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 1000 }));
  assert.deepEqual(r2, { ok: true, replayed: true, credits: 1000 });
  assert.equal(db.ledger.length, 1);
  assert.equal(db.wallets.get('a@x.com'), 1000);
});

test('op_id é escopado por e-mail: contas diferentes não colidem', async () => {
  const db = new FakeDb();
  const a = await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'op', kind: 'grant', creditsDelta: 100 }));
  const b = await applyUltTransaction(db.sql, 'b@x.com', tx({ opId: 'op', kind: 'grant', creditsDelta: 200 }));
  assert.equal(a.ok && !a.replayed, true);
  assert.equal(b.ok && !b.replayed, true);
  assert.equal(db.wallets.get('b@x.com'), 200);
});

test('saldo nunca fica negativo: spend acima do saldo é rejeitado sem efeitos', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 300 }));
  const r = await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 's1', kind: 'spend', creditsDelta: -500 }));
  assert.deepEqual(r, { ok: false, error: 'insufficient_credits', credits: 300 });
  assert.equal(db.ledger.length, 1); // spend rejeitado não entra no ledger
  assert.equal(db.wallets.get('a@x.com'), 300);
});

test('pack: debita credits e adiciona cartas na coleção', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 5000 }));
  const r = await applyUltTransaction(db.sql, 'a@x.com', tx({
    opId: 'p1',
    kind: 'pack',
    creditsDelta: -3500,
    cards: [
      { op: 'add', cardId: 'own-1', cardKey: 'fallen:gold', meta: { boost: 0 } },
      { op: 'add', cardId: 'own-2', cardKey: 'fallen:gold', meta: { boost: 0 } }, // duplicata = outra cópia, uuid próprio
    ],
  }));
  assert.deepEqual(r, { ok: true, replayed: false, credits: 1500 });
  const cards = db.cardsOf('a@x.com');
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.cardKey), ['fallen:gold', 'fallen:gold']);
});

test('quicksell: remove a cópia e credita; replay não duplica o crédito', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x.com', tx({
    opId: 'p1', kind: 'reward', creditsDelta: 0,
    cards: [{ op: 'add', cardId: 'own-1', cardKey: 'coldzera:elite' }],
  }));
  const sell = tx({ opId: 'q1', kind: 'quicksell', creditsDelta: 750, cards: [{ op: 'remove', cardId: 'own-1' }] });
  const r1 = await applyUltTransaction(db.sql, 'a@x.com', sell);
  const r2 = await applyUltTransaction(db.sql, 'a@x.com', sell);
  assert.deepEqual(r1, { ok: true, replayed: false, credits: 750 });
  assert.deepEqual(r2, { ok: true, replayed: true, credits: 750 });
  assert.equal(db.cardsOf('a@x.com').length, 0);
  assert.equal(db.wallets.get('a@x.com'), 750);
});

test('toda aplicação passa pelo advisory lock transacional', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 10 }));
  assert.ok(db.executed.some((t) => t.includes('pg_advisory_xact_lock')));
});

// ----------------------------------------------------------------- getUltState

test('getUltState em conta vazia devolve zeros', async () => {
  const db = new FakeDb();
  const s = await getUltState(db.sql, 'novo@x.com');
  assert.deepEqual(s, { credits: 0, cards: [], ledgerTail: [] });
});

test('getUltState devolve saldo, coleção e cauda do ledger (mais novo primeiro)', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: 'g1', kind: 'grant', creditsDelta: 5000 }));
  await applyUltTransaction(db.sql, 'a@x.com', tx({
    opId: 'p1', kind: 'pack', creditsDelta: -3500,
    cards: [{ op: 'add', cardId: 'own-1', cardKey: 'fallen:gold', meta: { boost: 1 } }],
  }));
  const s = await getUltState(db.sql, 'a@x.com');
  assert.equal(s.credits, 1500);
  assert.equal(s.cards.length, 1);
  assert.equal(s.cards[0].cardId, 'own-1');
  assert.deepEqual(s.cards[0].meta, { boost: 1 });
  assert.deepEqual(s.ledgerTail.map((l) => l.opId), ['p1', 'g1']);
  assert.equal(s.ledgerTail[0].creditsDelta, -3500);
});

test('getUltState respeita o limite da cauda', async () => {
  const db = new FakeDb();
  for (let i = 0; i < 6; i++) {
    await applyUltTransaction(db.sql, 'a@x.com', tx({ opId: `g${i}`, kind: 'grant', creditsDelta: 1 }));
  }
  const s = await getUltState(db.sql, 'a@x.com', 3);
  assert.equal(s.ledgerTail.length, 3);
  assert.deepEqual(s.ledgerTail.map((l) => l.opId), ['g5', 'g4', 'g3']);
});

// ------------------------------------------------ [O0-02] tx vinda do cliente

// valuer fake: 1000 por carta ('dup' vale cheio, única 70%) — só 'k:*' existe
const valuer: UltQuicksellValuer = (key, dup) => (key.startsWith('k:') ? (dup ? 1000 : 700) : null);
const loadValuer = async () => valuer;

test('checkClientUltTx: só spend/pack/sbc/quicksell, sem add, sem crédito positivo', () => {
  const ok = (t: Partial<UltTx>) => checkClientUltTx(tx({ opId: 'a', ...t })).ok;
  for (const kind of ['grant', 'reward', 'admin', 'escrow', 'trade'] as const) {
    assert.equal(ok({ kind, creditsDelta: 0 }), false, kind);
    assert.equal(ok({ kind, creditsDelta: 5000 }), false, kind);
  }
  assert.equal(ok({ kind: 'spend', creditsDelta: -500 }), true);
  assert.equal(ok({ kind: 'spend', creditsDelta: 1 }), false);
  assert.equal(ok({ kind: 'pack', creditsDelta: -900, cards: [{ op: 'add', cardId: 'c1', cardKey: 'k:1' }] }), false);
  assert.equal(ok({ kind: 'sbc', creditsDelta: 0, cards: [{ op: 'remove', cardId: 'c1' }] }), true);
  assert.equal(ok({ kind: 'sbc', creditsDelta: 2000, cards: [{ op: 'remove', cardId: 'c1' }] }), false);
  assert.equal(ok({ kind: 'quicksell', creditsDelta: 700, cards: [{ op: 'remove', cardId: 'c1' }] }), true);
  assert.equal(ok({ kind: 'quicksell', creditsDelta: -1, cards: [{ op: 'remove', cardId: 'c1' }] }), false);
  assert.equal(ok({ kind: 'quicksell', creditsDelta: 700 }), false); // sem carta não há o que valorar
});

test('handler tx: rejeita grant/reward/admin positivo e carta forjada sem tocar o banco', async () => {
  const db = new FakeDb();
  const attempts: unknown[] = [
    { opId: 'x1', kind: 'grant', creditsDelta: 900_000_000 },
    { opId: 'x2', kind: 'reward', creditsDelta: 50_000_000 },
    { opId: 'x3', kind: 'admin', creditsDelta: 50_000_000 },
    { opId: 'x4', kind: 'grant', creditsDelta: 0, cards: [{ op: 'add', cardId: 'u1', cardKey: 'k:icone' }] },
    { opId: 'x5', kind: 'pack', creditsDelta: 0, cards: [{ op: 'add', cardId: 'u2', cardKey: 'k:icone' }] },
    { opId: 'x6', kind: 'trade', creditsDelta: 10_000 },
    { opId: 'x7', kind: 'spend', creditsDelta: 10_000 },
  ];
  for (const raw of attempts) {
    const r = await applyClientUltTx(db.sql, 'a@x', raw, loadValuer);
    assert.equal(r.status, 400, JSON.stringify(raw));
  }
  assert.equal(db.ledger.length, 0);
  assert.equal(db.wallets.get('a@x') ?? 0, 0);
  assert.equal(db.cardsOf('a@x').length, 0);
});

test('handler tx: spend negativo passa e respeita o saldo do servidor', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x', tx({ opId: 'coins:c1', creditsDelta: 30_000 }));
  const ok = await applyClientUltTx(db.sql, 'a@x', { opId: 's1', kind: 'spend', creditsDelta: -8000 }, loadValuer);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.credits, 22_000);
  const broke = await applyClientUltTx(db.sql, 'a@x', { opId: 's2', kind: 'spend', creditsDelta: -99_000 }, loadValuer);
  assert.equal(broke.status, 409);
  assert.equal(broke.body.error, 'insufficient_credits');
});

test('handler tx: quicksell ignora o valor do cliente e credita pelo card_key do servidor', async () => {
  const db = new FakeDb();
  // servidor conhece 3 cópias: duas de k:a (duplicata) e uma de k:b (única)
  await applyUltTransaction(db.sql, 'a@x', tx({ opId: 'pack1', kind: 'pack', cards: [
    { op: 'add', cardId: 'c1', cardKey: 'k:a' },
    { op: 'add', cardId: 'c2', cardKey: 'k:a' },
    { op: 'add', cardId: 'c3', cardKey: 'k:b' },
  ] }));
  const r = await applyClientUltTx(db.sql, 'a@x', {
    opId: 'qs1', kind: 'quicksell', creditsDelta: 9_999_999,
    // c1 (dup → 1000) + c2 (agora única → 700) + c3 (única → 700) + 'local1' (só local → 0)
    cards: [{ op: 'remove', cardId: 'c1' }, { op: 'remove', cardId: 'c2' }, { op: 'remove', cardId: 'c3' }, { op: 'remove', cardId: 'local1' }],
  }, loadValuer);
  assert.equal(r.status, 200);
  assert.equal(r.body.credits, 2400);
  assert.equal(db.cardsOf('a@x').length, 0);
  const row = db.ledger.find((l) => l.opId === 'qs1');
  assert.equal(row?.delta, 2400);
  assert.equal(row?.meta.clientDelta, 9_999_999);
  // replay do mesmo op_id: nada re-aplica
  const again = await applyClientUltTx(db.sql, 'a@x', { opId: 'qs1', kind: 'quicksell', creditsDelta: 1, cards: [{ op: 'remove', cardId: 'c1' }] }, loadValuer);
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(db.wallets.get('a@x'), 2400);
  // vender de novo a carta que já saiu (outro op_id): vale 0
  const ghost = await applyClientUltTx(db.sql, 'a@x', { opId: 'qs2', kind: 'quicksell', creditsDelta: 1000, cards: [{ op: 'remove', cardId: 'c1' }] }, loadValuer);
  assert.equal(ghost.status, 200);
  assert.equal(db.wallets.get('a@x'), 2400);
});

test('handler tx: quicksell com catálogo indisponível responde 503 (fila re-tenta)', async () => {
  const db = new FakeDb();
  const r = await applyClientUltTx(db.sql, 'a@x', { opId: 'qs1', kind: 'quicksell', creditsDelta: 700, cards: [{ op: 'remove', cardId: 'c1' }] }, async () => null);
  assert.equal(r.status, 503);
  assert.equal(db.ledger.length, 0);
});

test('applyUltTransaction: requireOwned barra crédito sem a carta (quicksell concorrente)', async () => {
  const db = new FakeDb();
  await applyUltTransaction(db.sql, 'a@x', tx({ opId: 'p', kind: 'pack', cards: [{ op: 'add', cardId: 'c1', cardKey: 'k:a' }] }));
  const first = await applyUltTransaction(db.sql, 'a@x', tx({ opId: 'q1', kind: 'quicksell', creditsDelta: 1000, cards: [{ op: 'remove', cardId: 'c1' }] }), { requireOwned: [{ cardId: 'c1', cardKey: 'k:a' }] });
  assert.ok(first.ok);
  const second = await applyUltTransaction(db.sql, 'a@x', tx({ opId: 'q2', kind: 'quicksell', creditsDelta: 1000, cards: [{ op: 'remove', cardId: 'c1' }] }), { requireOwned: [{ cardId: 'c1', cardKey: 'k:a' }] });
  assert.deepEqual(second, { ok: false, error: 'not_owner', credits: 1000 });
  assert.equal(db.wallets.get('a@x'), 1000);
});

test('congelamento: frozen_at lido da carteira + mensagem com prazo de 7 dias', async () => {
  const db = new FakeDb();
  assert.equal(await isUltWalletFrozen(db.sql, 'a@x'), false);
  db.frozen.add('a@x');
  assert.equal(await isUltWalletFrozen(db.sql, 'a@x'), true);
  assert.match(ultFrozenMessage('suporte@exemplo.com'), /7 dias/);
  assert.match(ultFrozenMessage('suporte@exemplo.com'), /suporte@exemplo\.com/);
  assert.ok(db.executed.some((q) => q.startsWith('SELECT frozen_at FROM rtm_ult_wallet')));
});
