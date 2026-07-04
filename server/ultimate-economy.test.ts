import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ULT_TX_MAX_CARDS,
  applyUltTransaction,
  getUltState,
  ultEconomySchemaQueries,
  validateUltTx,
  type SqlTag,
  type UltTx,
} from './ultimate-economy.js';

// ---------------------------------------------------------------------------
// Fake do tag `sql` do Neon: guarda texto+params de cada query e executa a
// semântica dos statements num banco em memória (wallet/cards/ledger por
// e-mail). Emula exatamente o comportamento do statement WITH ... do módulo:
// replay não re-aplica, saldo nunca fica negativo, cartas add/remove só quando
// o ledger insere.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface PendingQuery extends PromiseLike<Row[]> {
  text: string;
  params: unknown[];
}

class FakeDb {
  wallets = new Map<string, number>();
  cards = new Map<string, { cardId: string; cardKey: string; meta: Record<string, unknown>; acquiredAt: string }[]>();
  ledger: { id: number; email: string; opId: string; kind: string; delta: number; createdAt: string }[] = [];
  nextId = 1;
  executed: string[] = [];

  sql: SqlTag;

  constructor() {
    const tag = (strings: TemplateStringsArray, ...params: unknown[]): PendingQuery => {
      const text = strings.join(' ').replace(/\s+/g, ' ').trim();
      const q: PendingQuery = {
        text,
        params,
        then: (onOk, onErr) => Promise.resolve().then(() => this.run(q)).then(onOk, onErr),
      };
      return q;
    };
    const transaction = async (queries: PromiseLike<Row[]>[]): Promise<Row[][]> => {
      const out: Row[][] = [];
      for (const q of queries) out.push(this.run(q as PendingQuery));
      return out;
    };
    this.sql = Object.assign(tag, { transaction }) as unknown as SqlTag;
  }

  cardsOf(email: string) {
    let list = this.cards.get(email);
    if (!list) { list = []; this.cards.set(email, list); }
    return list;
  }

  run(q: PendingQuery): Row[] {
    const { text, params } = q;
    this.executed.push(text);
    if (text.includes('pg_advisory_xact_lock')) return [];
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX')) return [];

    // O statement transacional grande (WITH prior AS ...).
    if (text.startsWith('WITH prior AS')) {
      const email = String(params[0]);
      const opId = String(params[1]);
      const kind = String(params[5]);
      const delta = Number(params[6]);
      const cardOps = JSON.parse(String(params[7])) as { op: string; cardId: string; cardKey?: string; meta?: Row }[];
      const prior = this.ledger.find((l) => l.email === email && l.opId === opId);
      const oldCredits = this.wallets.get(email) ?? 0;
      if (prior) return [{ prior_id: prior.id, inserted_id: null, new_credits: null, old_credits: oldCredits }];
      if (oldCredits + delta < 0) return [{ prior_id: null, inserted_id: null, new_credits: null, old_credits: oldCredits }];
      const id = this.nextId++;
      this.ledger.push({ id, email, opId, kind, delta, createdAt: new Date(1_700_000_000_000 + id * 1000).toISOString() });
      const newCredits = oldCredits + delta;
      this.wallets.set(email, newCredits);
      const list = this.cardsOf(email);
      for (const c of cardOps) {
        if (c.op === 'add' && !list.some((x) => x.cardId === c.cardId)) {
          list.push({ cardId: c.cardId, cardKey: c.cardKey ?? '', meta: (c.meta as Record<string, unknown>) ?? {}, acquiredAt: new Date(1_700_000_000_000 + id * 1000).toISOString() });
        }
        if (c.op === 'remove') {
          const i = list.findIndex((x) => x.cardId === c.cardId);
          if (i >= 0) list.splice(i, 1);
        }
      }
      return [{ prior_id: null, inserted_id: id, new_credits: newCredits, old_credits: oldCredits }];
    }

    // Queries do getUltState.
    if (text.includes('FROM rtm_ult_wallet WHERE')) {
      const email = String(params[0]);
      return this.wallets.has(email) ? [{ credits: this.wallets.get(email) }] : [];
    }
    if (text.includes('FROM rtm_ult_cards WHERE')) {
      const email = String(params[0]);
      return this.cardsOf(email).map((c) => ({ card_id: c.cardId, card_key: c.cardKey, meta: c.meta, acquired_at: c.acquiredAt }));
    }
    if (text.includes('FROM rtm_ult_ledger WHERE')) {
      const email = String(params[0]);
      const limit = Number(params[1]);
      return this.ledger
        .filter((l) => l.email === email)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((l) => ({ id: l.id, op_id: l.opId, kind: l.kind, credits_delta: l.delta, created_at: l.createdAt }));
    }
    throw new Error(`query não emulada: ${text.slice(0, 60)}`);
  }
}

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
  assert.equal(queries.length, 4);
  const texts = queries.map((q) => (q as unknown as { text: string }).text);
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
