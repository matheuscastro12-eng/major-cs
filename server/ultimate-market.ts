// Mercado JOGADOR↔JOGADOR do Ultimate Squad (fase A — servidor). Casa de
// listagens de preço FIXO (v1 — sem leilão: menos vetores de abuso, UX mais
// simples). Coexiste com o bazar de IA (src/engine/ultimate/bazaar.ts): o bazar
// é offline/cosmético; AQUI é a economia real server-authoritative.
//
// Anti-abuso (decisões de design, não acidente):
//  - preço preso a 0.5×..3× do estimateCardValue do catálogo → estrangula
//    lavagem de créditos/RMT (não dá pra "vender um bronze por 1 milhão");
//  - taxa de 5% na venda é QUEIMADA (sink de créditos da economia);
//  - máx 10 listagens ativas por vendedor (spam/cartel);
//  - especiais (tots/major/promo) NÃO listáveis na v1 (escassez curada);
//  - TODA perna passa pelo ledger (rtm_ult_ledger) com listingId no meta —
//    kinds 'escrow' (carta entra/sai do custódia) e 'trade' (liquidação),
//    ambos SERVER-ONLY (a rota bloqueia esses kinds em tx do cliente).
//
// Atomicidade: mesmo padrão do applyUltTransaction — advisory lock transacional
// por e-mail + UM statement WITH que checa guardas, muda a listagem, grava o
// ledger e move carta/carteira de uma vez. Idempotência da compra: op_id
// 'mkt-buy:<listingId>' no ledger do comprador + guarda status='active' no
// MESMO statement ⇒ uma listagem só vende uma vez.
//
// Expiração: LAZY — toda leitura/mutação primeiro expira listagens vencidas
// (status→expired + carta de volta via ledger 'escrow'). Zero cron.

// HOTFIX (import runtime): este módulo NÃO pode importar a cadeia do engine
// (cards/ultimate-pack → src/data/*) em top-level — na Vercel os arquivos do
// engine são compilados sem bundle e os imports SEM extensão deles quebram o
// Node ESM em runtime (ERR_MODULE_NOT_FOUND src/data/regions), derrubando a
// rota inteira no load. O catálogo agora entra INJETADO (MktCardLookup, criado
// via dynamic import em server/ultimate-catalog-lazy.ts) só no listCard, único
// ponto que precisa dele. import type é apagado na compilação — seguro.
import type { UltRarity } from '../src/engine/ultimate/rarities.js';
import type { SqlQuery, SqlTag } from './ultimate-economy.js';

// Info mínima da carta pro anchor de preço — `value` JÁ vem calculado pelo
// carregador (estimateCardValue) e `special` idem (isSpecial), pra este módulo
// não tocar na cadeia pesada nem em runtime.
export interface MktCardInfo { ovr: number; rarity: UltRarity; value: number; special: boolean }
export type MktCardLookup = (cardKey: string) => MktCardInfo | null;

export const MKT_MAX_ACTIVE_LISTINGS = 10;
export const MKT_TAX_RATE = 0.05; // 5% queimados na venda (sink)
export const MKT_PRICE_FLOOR_MULT = 0.5; // piso: 0.5× valor estimado
export const MKT_PRICE_CEIL_MULT = 3; // teto: 3× valor estimado
export const MKT_LISTING_TTL_MS = 48 * 60 * 60 * 1000; // 48h
export const MKT_BROWSE_CAP = 50;
export const MKT_MINE_CAP = 30;

export type MktListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';

export interface MktListing {
  id: number;
  sellerEmail: string;
  cardId: string;
  cardKey: string;
  price: number;
  status: MktListingStatus;
  createdAt: string;
  expiresAt: string;
  buyerEmail: string | null;
  soldAt: string | null;
}

// ------------------------------------------------------------------- schema

// DDL idempotente (mesmo padrão do ultEconomySchemaQueries). card_meta carrega
// o meta da cópia (boost/serial…) através do custódia — sem ele a carta
// voltaria "pelada" pro comprador.
export function ultMarketSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_listings (
      id BIGSERIAL PRIMARY KEY,
      seller_email TEXT NOT NULL,
      card_id TEXT NOT NULL,
      card_key TEXT NOT NULL,
      card_meta JSONB NOT NULL DEFAULT '{}',
      price BIGINT NOT NULL CHECK (price > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled','expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      buyer_email TEXT,
      sold_at TIMESTAMPTZ
    )`,
    sql`CREATE INDEX IF NOT EXISTS rtm_ult_listings_status_key_idx ON rtm_ult_listings (status, card_key)`,
    sql`CREATE INDEX IF NOT EXISTS rtm_ult_listings_seller_idx ON rtm_ult_listings (seller_email, status)`,
  ];
}

// ------------------------------------------------------------ preço âncora

// Faixa permitida de preço pra uma carta do catálogo. Âncora única =
// estimateCardValue (mesma função que o cliente/bazar usam) ⇒ piso/teto
// acompanham OVR × raridade sem tabela paralela. O `value` chega pré-calculado
// no MktCardInfo (ver nota do hotfix no topo).
export function mktPriceBounds(card: Pick<MktCardInfo, 'value'>): { min: number; max: number } {
  return {
    min: Math.max(1, Math.ceil(card.value * MKT_PRICE_FLOOR_MULT)),
    max: Math.max(1, Math.floor(card.value * MKT_PRICE_CEIL_MULT)),
  };
}

// Recebido pelo vendedor após a taxa de 5% — o resto é queimado.
export function mktSellerProceeds(price: number): number {
  return Math.ceil(price * (1 - MKT_TAX_RATE));
}

// --------------------------------------------------------------- expiração

// Expira TODAS as listagens ativas vencidas: status→expired, carta volta pro
// vendedor e cada devolução ganha uma linha 'escrow' no ledger
// (op_id 'mkt-expire:<id>' — idempotente por natureza). Chamada lazy no início
// de qualquer operação do mercado.
export async function expireListings(sql: SqlTag, now: Date = new Date()): Promise<number> {
  const nowIso = now.toISOString();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_ult_market'), 0)`,
    sql`WITH mkt_expire AS (
          UPDATE rtm_ult_listings SET status='expired'
          WHERE status='active' AND expires_at <= ${nowIso}
          RETURNING id, seller_email, card_id, card_key, card_meta
        ), led AS (
          INSERT INTO rtm_ult_ledger (email, op_id, kind, credits_delta, cards, meta)
          SELECT seller_email, 'mkt-expire:' || id, 'escrow', 0,
                 jsonb_build_array(jsonb_build_object('op','add','cardId',card_id,'cardKey',card_key,'meta',card_meta)),
                 jsonb_build_object('listingId', id, 'action', 'expire')
          FROM mkt_expire
          ON CONFLICT (email, op_id) DO NOTHING
        ), back AS (
          INSERT INTO rtm_ult_cards (email, card_id, card_key, meta)
          SELECT seller_email, card_id, card_key, card_meta FROM mkt_expire
          ON CONFLICT (email, card_id) DO NOTHING
        )
        SELECT count(*)::int AS n FROM mkt_expire`,
  ]);
  return Number(rows?.[0]?.n ?? 0);
}

// ------------------------------------------------------------------- listar

export type MktListResult =
  | { ok: true; listingId: number; expiresAt: string; price: number }
  | { ok: false; error: 'invalid_price'; min?: number; max?: number }
  | { ok: false; error: 'not_owner' }
  | { ok: false; error: 'unknown_card' }
  | { ok: false; error: 'special_not_listable' }
  | { ok: false; error: 'listing_cap'; cap: number }
  // catálogo indisponível no servidor (cadeia do engine não carregou) — a rota
  // devolve 503 e o cliente mostra o estado offline amigável; browse/buy seguem.
  | { ok: false; error: 'catalog_unavailable' };

// Lista uma carta: valida posse + faixa de preço + cap, e num statement único
// insere a listagem, grava a perna 'escrow' no ledger (remove) e tira a carta
// de rtm_ult_cards (custódia). Retry após sucesso ⇒ 'not_owner' (a carta já
// está no custódia) — o cliente refaz o estado via mktMine.
export async function listCard(
  sql: SqlTag,
  sellerEmail: string,
  req: { cardId: string; price: number },
  lookup: MktCardLookup | null,
  opts?: { now?: Date },
): Promise<MktListResult> {
  const now = opts?.now ?? new Date();
  // sem catálogo (cadeia do engine não carregou no servidor) não há âncora de
  // preço confiável — recusa listar em vez de aceitar preço sem validação.
  if (!lookup) return { ok: false, error: 'catalog_unavailable' };
  await expireListings(sql, now);

  const price = req.price;
  if (!Number.isSafeInteger(price) || price <= 0) return { ok: false, error: 'invalid_price' };

  // 1) leitura da cópia (fora do lock — o statement final RE-checa a posse).
  const ownedRows = await sql`SELECT card_key FROM rtm_ult_cards WHERE email=${sellerEmail} AND card_id=${req.cardId}`;
  if (!ownedRows.length) return { ok: false, error: 'not_owner' };
  const cardKey = String(ownedRows[0].card_key ?? '');

  // 2) âncora de preço SEMPRE do catálogo do servidor (nunca do request).
  const card = lookup(cardKey);
  if (!card) return { ok: false, error: 'unknown_card' };
  if (card.special) return { ok: false, error: 'special_not_listable' };
  const bounds = mktPriceBounds(card);
  if (price < bounds.min || price > bounds.max) {
    return { ok: false, error: 'invalid_price', min: bounds.min, max: bounds.max };
  }

  // 3) statement atômico: posse + cap re-checados sob lock do vendedor.
  const expiresAt = new Date(now.getTime() + MKT_LISTING_TTL_MS).toISOString();
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_ult_economy'), hashtext(${sellerEmail}))`,
    sql`WITH mkt_list_owned AS (
          SELECT card_id, card_key, meta FROM rtm_ult_cards
          WHERE email=${sellerEmail} AND card_id=${req.cardId} AND card_key=${cardKey}
        ), act AS (
          SELECT count(*)::int AS n FROM rtm_ult_listings WHERE seller_email=${sellerEmail} AND status='active'
        ), ins AS (
          INSERT INTO rtm_ult_listings (seller_email, card_id, card_key, card_meta, price, status, created_at, expires_at)
          SELECT ${sellerEmail}, card_id, card_key, meta, ${price}, 'active', ${now.toISOString()}, ${expiresAt}
          FROM mkt_list_owned
          WHERE (SELECT n FROM act) < ${MKT_MAX_ACTIVE_LISTINGS}
          RETURNING id, expires_at
        ), led AS (
          INSERT INTO rtm_ult_ledger (email, op_id, kind, credits_delta, cards, meta)
          SELECT ${sellerEmail}, 'mkt-list:' || (SELECT id FROM ins), 'escrow', 0,
                 -- casts explícitos: parâmetro dentro de jsonb_build_* é "any" e o
                 -- PG não infere o tipo (42P18 "could not determine data type of
                 -- parameter" visto em produção — o FakeDb dos testes não typa).
                 jsonb_build_array(jsonb_build_object('op','remove','cardId',${req.cardId}::text)),
                 jsonb_build_object('listingId',(SELECT id FROM ins),'action','list','cardKey',${cardKey}::text,'price',${price}::bigint)
          WHERE EXISTS (SELECT 1 FROM ins)
        ), del AS (
          DELETE FROM rtm_ult_cards
          WHERE email=${sellerEmail} AND card_id=${req.cardId} AND EXISTS (SELECT 1 FROM ins)
        )
        SELECT (SELECT id FROM ins) AS listing_id,
               EXISTS (SELECT 1 FROM mkt_list_owned) AS owned,
               (SELECT n FROM act) AS active_n`,
  ]);
  const r = rows?.[0] ?? {};
  if (r.listing_id != null) return { ok: true, listingId: Number(r.listing_id), expiresAt, price };
  if (!r.owned) return { ok: false, error: 'not_owner' };
  return { ok: false, error: 'listing_cap', cap: MKT_MAX_ACTIVE_LISTINGS };
}

// ------------------------------------------------------------------- compra

export type MktBuyResult =
  | { ok: true; replayed: boolean; credits: number; listingId: number; cardId: string; cardKey: string; price: number; proceeds: number }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'not_active' }
  | { ok: false; error: 'self_buy' }
  | { ok: false; error: 'insufficient_credits'; credits: number };

// Compra atômica: comprador paga `price` (ledger 'trade', -price, carta add),
// vendedor recebe ceil(price×0.95) (ledger 'trade', +proceeds), 5% queimam.
// Guardas NO MESMO statement: listagem ainda 'active' com o MESMO preço,
// comprador ≠ vendedor, saldo suficiente, op_id inédito. Locks nos DOIS
// e-mails em ordem lexicográfica (sem deadlock com compras cruzadas).
export async function buyListing(
  sql: SqlTag,
  buyerEmail: string,
  req: { listingId: number },
  opts?: { now?: Date },
): Promise<MktBuyResult> {
  const now = opts?.now ?? new Date();
  await expireListings(sql, now);

  const lid = Math.trunc(req.listingId);
  if (!Number.isSafeInteger(lid) || lid <= 0) return { ok: false, error: 'not_found' };
  const opId = `mkt-buy:${lid}`;

  // Leitura (o statement final re-checa status/preço sob lock).
  const lrows = await sql`SELECT id, seller_email, card_id, card_key, card_meta, price, status FROM rtm_ult_listings WHERE id=${lid}`;
  if (!lrows.length) return { ok: false, error: 'not_found' };
  const L = lrows[0];
  const seller = String(L.seller_email ?? '');
  if (seller === buyerEmail) return { ok: false, error: 'self_buy' };
  const price = Number(L.price ?? 0);
  const cardId = String(L.card_id ?? '');
  const cardKey = String(L.card_key ?? '');
  const cardMeta = L.card_meta && typeof L.card_meta === 'object' ? (L.card_meta as Record<string, unknown>) : {};
  if (String(L.status) !== 'active') {
    // já comprei? replay idempotente devolve ok (buyer_email + ledger provam).
    if (String(L.status) === 'sold' && String(L.buyer_email ?? '') === buyerEmail) {
      const wr = await sql`SELECT credits FROM rtm_ult_wallet WHERE email=${buyerEmail}`;
      return {
        ok: true, replayed: true, credits: wr.length ? Number(wr[0].credits ?? 0) : 0,
        listingId: lid, cardId, cardKey, price, proceeds: mktSellerProceeds(price),
      };
    }
    return { ok: false, error: 'not_active' };
  }

  const proceeds = mktSellerProceeds(price);
  const buyerCards = JSON.stringify([{ op: 'add', cardId, cardKey, meta: { ...cardMeta, acquiredVia: 'market', listingId: lid } }]);
  const buyerMeta = JSON.stringify({ listingId: lid, side: 'buy', seller, price, cardKey });
  const sellerMeta = JSON.stringify({ listingId: lid, side: 'sell', buyer: buyerEmail, price, proceeds, tax: price - proceeds, cardKey });
  const [lockA, lockB] = [buyerEmail, seller].sort();
  const nowIso = now.toISOString();

  const rows = (await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_ult_economy'), hashtext(${lockA}))`,
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_ult_economy'), hashtext(${lockB}))`,
    sql`WITH mkt_buy_prior AS (
          SELECT id FROM rtm_ult_ledger WHERE email=${buyerEmail} AND op_id=${opId}
        ), bal AS (
          SELECT COALESCE((SELECT credits FROM rtm_ult_wallet WHERE email=${buyerEmail}), 0)::bigint AS credits
        ), upd AS (
          UPDATE rtm_ult_listings SET status='sold', buyer_email=${buyerEmail}, sold_at=${nowIso}
          WHERE id=${lid} AND status='active' AND price=${price} AND seller_email=${seller}
            AND seller_email <> ${buyerEmail}
            AND NOT EXISTS (SELECT 1 FROM mkt_buy_prior)
            AND (SELECT credits FROM bal) >= ${price}
          RETURNING id
        ), buyer_led AS (
          INSERT INTO rtm_ult_ledger (email, op_id, kind, credits_delta, cards, meta)
          SELECT ${buyerEmail}, ${opId}, 'trade', ${-price}, ${buyerCards}::jsonb, ${buyerMeta}::jsonb
          WHERE EXISTS (SELECT 1 FROM upd)
        ), seller_led AS (
          INSERT INTO rtm_ult_ledger (email, op_id, kind, credits_delta, cards, meta)
          SELECT ${seller}, ${'mkt-sold:' + lid}, 'trade', ${proceeds}, '[]'::jsonb, ${sellerMeta}::jsonb
          WHERE EXISTS (SELECT 1 FROM upd)
        ), buyer_wallet AS (
          INSERT INTO rtm_ult_wallet (email, credits, updated_at)
          SELECT ${buyerEmail}, (SELECT credits FROM bal) - ${price}, now()
          WHERE EXISTS (SELECT 1 FROM upd)
          ON CONFLICT (email) DO UPDATE SET credits = EXCLUDED.credits, updated_at = now()
          RETURNING credits
        ), seller_wallet AS (
          INSERT INTO rtm_ult_wallet (email, credits, updated_at)
          SELECT ${seller}, ${proceeds}, now()
          WHERE EXISTS (SELECT 1 FROM upd)
          ON CONFLICT (email) DO UPDATE SET credits = rtm_ult_wallet.credits + ${proceeds}, updated_at = now()
        ), card AS (
          INSERT INTO rtm_ult_cards (email, card_id, card_key, meta)
          SELECT ${buyerEmail}, ${cardId}, ${cardKey}, (${buyerCards}::jsonb)->0->'meta'
          WHERE EXISTS (SELECT 1 FROM upd)
          ON CONFLICT (email, card_id) DO NOTHING
        )
        SELECT (SELECT id FROM upd) AS sold_id,
               (SELECT id FROM mkt_buy_prior) AS prior_id,
               (SELECT credits FROM bal) AS old_credits,
               (SELECT credits FROM buyer_wallet) AS new_credits`,
  ]))[2];
  const r = rows?.[0] ?? {};
  const oldCredits = Number(r.old_credits ?? 0);
  if (r.sold_id != null) {
    return { ok: true, replayed: false, credits: Number(r.new_credits ?? 0), listingId: lid, cardId, cardKey, price, proceeds };
  }
  if (r.prior_id != null) {
    return { ok: true, replayed: true, credits: oldCredits, listingId: lid, cardId, cardKey, price, proceeds };
  }
  if (oldCredits < price) return { ok: false, error: 'insufficient_credits', credits: oldCredits };
  return { ok: false, error: 'not_active' }; // corrida: vendida/cancelada no meio
}

// ----------------------------------------------------------------- cancelar

export type MktCancelResult =
  | { ok: true; listingId: number }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'not_active' };

// Só o vendedor cancela, e só listagem ativa. Carta volta via perna 'escrow'
// no ledger (op_id 'mkt-cancel:<id>').
export async function cancelListing(
  sql: SqlTag,
  sellerEmail: string,
  req: { listingId: number },
  opts?: { now?: Date },
): Promise<MktCancelResult> {
  const now = opts?.now ?? new Date();
  await expireListings(sql, now);
  const lid = Math.trunc(req.listingId);
  if (!Number.isSafeInteger(lid) || lid <= 0) return { ok: false, error: 'not_found' };
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_ult_economy'), hashtext(${sellerEmail}))`,
    sql`WITH mkt_cancel_upd AS (
          UPDATE rtm_ult_listings SET status='cancelled'
          WHERE id=${lid} AND seller_email=${sellerEmail} AND status='active'
          RETURNING id, card_id, card_key, card_meta
        ), led AS (
          INSERT INTO rtm_ult_ledger (email, op_id, kind, credits_delta, cards, meta)
          SELECT ${sellerEmail}, 'mkt-cancel:' || id, 'escrow', 0,
                 jsonb_build_array(jsonb_build_object('op','add','cardId',card_id,'cardKey',card_key,'meta',card_meta)),
                 jsonb_build_object('listingId', id, 'action', 'cancel')
          FROM mkt_cancel_upd
          ON CONFLICT (email, op_id) DO NOTHING
        ), back AS (
          INSERT INTO rtm_ult_cards (email, card_id, card_key, meta)
          SELECT ${sellerEmail}, card_id, card_key, card_meta FROM mkt_cancel_upd
          ON CONFLICT (email, card_id) DO NOTHING
        )
        SELECT (SELECT id FROM mkt_cancel_upd) AS cancelled_id,
               (SELECT status FROM rtm_ult_listings WHERE id=${lid} AND seller_email=${sellerEmail}) AS status`,
  ]);
  const r = rows?.[0] ?? {};
  if (r.cancelled_id != null) return { ok: true, listingId: lid };
  if (r.status == null) return { ok: false, error: 'not_found' }; // inexistente ou de outro vendedor
  return { ok: false, error: 'not_active' };
}

// ------------------------------------------------------------------ leitura

export interface MktBrowseFilters {
  cardKey?: string;
  maxPrice?: number;
  sort?: 'cheap' | 'new'; // default: mais barata primeiro
}

const rowToListing = (row: Record<string, unknown>): MktListing => ({
  id: Number(row.id ?? 0),
  sellerEmail: String(row.seller_email ?? ''),
  cardId: String(row.card_id ?? ''),
  cardKey: String(row.card_key ?? ''),
  price: Number(row.price ?? 0),
  status: String(row.status ?? 'active') as MktListingStatus,
  createdAt: String(row.created_at ?? ''),
  expiresAt: String(row.expires_at ?? ''),
  buyerEmail: row.buyer_email == null ? null : String(row.buyer_email),
  soldAt: row.sold_at == null ? null : String(row.sold_at),
});

// Vitrine: listagens ativas, filtro opcional por carta/preço, cap 50.
// Params fixos ('' / 0 = sem filtro) pra manter o statement único.
export async function browseListings(
  sql: SqlTag,
  filters: MktBrowseFilters = {},
  opts?: { now?: Date },
): Promise<MktListing[]> {
  const now = opts?.now ?? new Date();
  await expireListings(sql, now);
  const cardKey = typeof filters.cardKey === 'string' ? filters.cardKey.slice(0, 160) : '';
  const maxPrice = Number.isSafeInteger(filters.maxPrice) && (filters.maxPrice as number) > 0 ? (filters.maxPrice as number) : 0;
  const rows = filters.sort === 'new'
    ? await sql`SELECT id, seller_email, card_id, card_key, price, status, created_at, expires_at, buyer_email, sold_at
        FROM rtm_ult_listings
        WHERE status='active' AND (${cardKey} = '' OR card_key = ${cardKey}) AND (${maxPrice} = 0 OR price <= ${maxPrice})
        ORDER BY created_at DESC, id DESC LIMIT ${MKT_BROWSE_CAP}`
    : await sql`SELECT id, seller_email, card_id, card_key, price, status, created_at, expires_at, buyer_email, sold_at
        FROM rtm_ult_listings
        WHERE status='active' AND (${cardKey} = '' OR card_key = ${cardKey}) AND (${maxPrice} = 0 OR price <= ${maxPrice})
        ORDER BY price ASC, id ASC LIMIT ${MKT_BROWSE_CAP}`;
  return rows.map(rowToListing);
}

// Minhas listagens (todas as situações), mais recentes primeiro, cap 30.
export async function myListings(sql: SqlTag, sellerEmail: string, opts?: { now?: Date }): Promise<MktListing[]> {
  const now = opts?.now ?? new Date();
  await expireListings(sql, now);
  const rows = await sql`SELECT id, seller_email, card_id, card_key, price, status, created_at, expires_at, buyer_email, sold_at
    FROM rtm_ult_listings
    WHERE seller_email = ${sellerEmail}
    ORDER BY created_at DESC, id DESC LIMIT ${MKT_MINE_CAP}`;
  return rows.map(rowToListing);
}
