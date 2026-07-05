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

export interface FakeListing {
  id: number;
  sellerEmail: string;
  cardId: string;
  cardKey: string;
  cardMeta: Record<string, unknown>;
  price: number;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  buyerEmail: string | null;
  soldAt: string | null;
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
  listings: FakeListing[] = []; // rtm_ult_listings (mercado P2P)
  nextId = 1;
  nextListingId = 1;
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

    // ------------------------------------------------ mercado P2P (listings)
    const pushLedger = (email: string, opId: string, kind: string, delta: number, cards: Row[], meta: Row) => {
      if (this.ledger.some((l) => l.email === email && l.opId === opId)) return null; // ON CONFLICT DO NOTHING
      const id = this.nextId++;
      this.ledger.push({ id, email, opId, kind, delta, cards, meta, createdAt: new Date(1_700_000_000_000 + id * 1000).toISOString() });
      return id;
    };
    const returnCard = (email: string, cardId: string, cardKey: string, meta: Record<string, unknown>) => {
      const list = this.cardsOf(email);
      if (!list.some((x) => x.cardId === cardId)) {
        list.push({ cardId, cardKey, meta, acquiredAt: new Date().toISOString() });
      }
    };

    // Expiração lazy: UPDATE ... status='expired' + ledger 'escrow' + carta volta.
    if (text.startsWith('WITH mkt_expire AS')) {
      const nowIso = String(params[0]);
      let n = 0;
      for (const l of this.listings) {
        if (l.status === 'active' && l.expiresAt <= nowIso) {
          l.status = 'expired';
          n++;
          pushLedger(l.sellerEmail, `mkt-expire:${l.id}`, 'escrow', 0,
            [{ op: 'add', cardId: l.cardId, cardKey: l.cardKey, meta: l.cardMeta }],
            { listingId: l.id, action: 'expire' });
          returnCard(l.sellerEmail, l.cardId, l.cardKey, l.cardMeta);
        }
      }
      return [{ n }];
    }

    // Leitura de posse do listCard (mais específica que o handler genérico de cards).
    if (text.startsWith('SELECT card_key FROM rtm_ult_cards WHERE')) {
      const email = String(params[0]);
      const cardId = String(params[1]);
      return this.cardsOf(email).filter((c) => c.cardId === cardId).map((c) => ({ card_key: c.cardKey }));
    }

    // Statement atômico do listCard.
    if (text.startsWith('WITH mkt_list_owned AS')) {
      const seller = String(params[0]);
      const cardId = String(params[1]);
      const cardKey = String(params[2]);
      const price = Number(params[5]);
      const createdAt = String(params[6]);
      const expiresAt = String(params[7]);
      const cap = Number(params[8]);
      const list = this.cardsOf(seller);
      const ownedIdx = list.findIndex((c) => c.cardId === cardId && c.cardKey === cardKey);
      const activeN = this.listings.filter((l) => l.sellerEmail === seller && l.status === 'active').length;
      if (ownedIdx < 0) return [{ listing_id: null, owned: false, active_n: activeN }];
      if (activeN >= cap) return [{ listing_id: null, owned: true, active_n: activeN }];
      const owned = list[ownedIdx];
      const id = this.nextListingId++;
      this.listings.push({
        id, sellerEmail: seller, cardId, cardKey, cardMeta: owned.meta, price,
        status: 'active', createdAt, expiresAt, buyerEmail: null, soldAt: null,
      });
      pushLedger(seller, `mkt-list:${id}`, 'escrow', 0,
        [{ op: 'remove', cardId }], { listingId: id, action: 'list', cardKey, price });
      list.splice(ownedIdx, 1);
      return [{ listing_id: id, owned: true, active_n: activeN }];
    }

    // Leitura da listagem no buyListing.
    if (text.startsWith('SELECT id, seller_email, card_id, card_key, card_meta, price, status FROM rtm_ult_listings WHERE id=')) {
      const id = Number(params[0]);
      return this.listings.filter((l) => l.id === id).map((l) => ({
        id: l.id, seller_email: l.sellerEmail, card_id: l.cardId, card_key: l.cardKey,
        card_meta: l.cardMeta, price: l.price, status: l.status, buyer_email: l.buyerEmail,
      }));
    }

    // Statement atômico do buyListing (as duas pernas 'trade' + carta + carteiras).
    if (text.startsWith('WITH mkt_buy_prior AS')) {
      const buyer = String(params[0]);
      const opId = String(params[1]);
      const nowIso = String(params[4]);
      const lid = Number(params[5]);
      const price = Number(params[6]);
      const seller = String(params[7]);
      const buyerCards = JSON.parse(String(params[13])) as Row[];
      const buyerMeta = JSON.parse(String(params[14])) as Row;
      const sellerOpId = String(params[16]);
      const proceeds = Number(params[17]);
      const sellerMeta = JSON.parse(String(params[18])) as Row;
      const cardId = String(params[25]);
      const cardKey = String(params[26]);
      const prior = this.ledger.find((l) => l.email === buyer && l.opId === opId);
      const oldCredits = this.wallets.get(buyer) ?? 0;
      const listing = this.listings.find((l) => l.id === lid);
      const eligible = listing && listing.status === 'active' && listing.price === price
        && listing.sellerEmail === seller && seller !== buyer && !prior && oldCredits >= price;
      if (!eligible) {
        return [{ sold_id: null, prior_id: prior?.id ?? null, old_credits: oldCredits, new_credits: null }];
      }
      listing.status = 'sold';
      listing.buyerEmail = buyer;
      listing.soldAt = nowIso;
      pushLedger(buyer, opId, 'trade', -price, buyerCards, buyerMeta);
      pushLedger(seller, sellerOpId, 'trade', proceeds, [], sellerMeta);
      const newCredits = oldCredits - price;
      this.wallets.set(buyer, newCredits);
      this.wallets.set(seller, (this.wallets.get(seller) ?? 0) + proceeds);
      const cardMeta = ((buyerCards[0] as { meta?: Record<string, unknown> })?.meta) ?? {};
      returnCard(buyer, cardId, cardKey, cardMeta);
      return [{ sold_id: lid, prior_id: null, old_credits: oldCredits, new_credits: newCredits }];
    }

    // Statement atômico do cancelListing.
    if (text.startsWith('WITH mkt_cancel_upd AS')) {
      const lid = Number(params[0]);
      const seller = String(params[1]);
      const listing = this.listings.find((l) => l.id === lid && l.sellerEmail === seller);
      if (!listing) return [{ cancelled_id: null, status: null }];
      if (listing.status !== 'active') return [{ cancelled_id: null, status: listing.status }];
      listing.status = 'cancelled';
      pushLedger(seller, `mkt-cancel:${lid}`, 'escrow', 0,
        [{ op: 'add', cardId: listing.cardId, cardKey: listing.cardKey, meta: listing.cardMeta }],
        { listingId: lid, action: 'cancel' });
      returnCard(seller, listing.cardId, listing.cardKey, listing.cardMeta);
      return [{ cancelled_id: lid, status: 'cancelled' }];
    }

    // browse / mine (SELECTs de leitura de listagens).
    if (text.startsWith('SELECT id, seller_email, card_id, card_key, price, status, created_at, expires_at, buyer_email, sold_at FROM rtm_ult_listings')) {
      const toRow = (l: FakeListing): Row => ({
        id: l.id, seller_email: l.sellerEmail, card_id: l.cardId, card_key: l.cardKey,
        price: l.price, status: l.status, created_at: l.createdAt, expires_at: l.expiresAt,
        buyer_email: l.buyerEmail, sold_at: l.soldAt,
      });
      if (text.includes("WHERE status='active'")) {
        const cardKey = String(params[0]);
        const maxPrice = Number(params[2]);
        const cap = Number(params[4]);
        const rows = this.listings.filter((l) =>
          l.status === 'active' && (cardKey === '' || l.cardKey === cardKey) && (maxPrice === 0 || l.price <= maxPrice));
        const sorted = text.includes('ORDER BY price ASC')
          ? rows.sort((a, b) => a.price - b.price || a.id - b.id)
          : rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
        return sorted.slice(0, cap).map(toRow);
      }
      // mine
      const seller = String(params[0]);
      const cap = Number(params[1]);
      return this.listings
        .filter((l) => l.sellerEmail === seller)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
        .slice(0, cap)
        .map(toRow);
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
