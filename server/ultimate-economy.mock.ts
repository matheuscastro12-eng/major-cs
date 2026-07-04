// Fake do tag `sql` do Neon pros testes da economia do Ultimate (extraído de
// ultimate-economy.test.ts pra ser compartilhado com ultimate-pack.test.ts).
// Guarda texto+params de cada query e executa a semântica dos statements num
// banco em memória (wallet/cards/ledger por e-mail). Emula exatamente o
// comportamento do statement WITH ... do módulo: replay não re-aplica, saldo
// nunca fica negativo, cartas add/remove só quando o ledger insere.
import type { SqlTag } from './ultimate-economy.js';

type Row = Record<string, unknown>;

export interface PendingQuery extends PromiseLike<Row[]> {
  text: string;
  params: unknown[];
}

interface LedgerRow {
  id: number;
  email: string;
  opId: string;
  kind: string;
  delta: number;
  cards: Row[];
  meta: Row;
  createdAt: string;
}

export class FakeDb {
  wallets = new Map<string, number>();
  cards = new Map<string, { cardId: string; cardKey: string; meta: Record<string, unknown>; acquiredAt: string }[]>();
  ledger: LedgerRow[] = [];
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
      const meta = JSON.parse(String(params[8])) as Row;
      const prior = this.ledger.find((l) => l.email === email && l.opId === opId);
      const oldCredits = this.wallets.get(email) ?? 0;
      if (prior) return [{ prior_id: prior.id, inserted_id: null, new_credits: null, old_credits: oldCredits }];
      if (oldCredits + delta < 0) return [{ prior_id: null, inserted_id: null, new_credits: null, old_credits: oldCredits }];
      const id = this.nextId++;
      this.ledger.push({ id, email, opId, kind, delta, cards: cardOps as unknown as Row[], meta, createdAt: new Date(1_700_000_000_000 + id * 1000).toISOString() });
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
    // Replay do packOpen: linha única do ledger por (email, op_id) — o Neon
    // devolve jsonb já parseado, então cards/meta saem como objetos.
    if (text.includes('FROM rtm_ult_ledger WHERE') && text.includes('op_id=')) {
      const email = String(params[0]);
      const opId = String(params[1]);
      return this.ledger
        .filter((l) => l.email === email && l.opId === opId)
        .map((l) => ({ kind: l.kind, cards: l.cards, meta: l.meta }));
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
